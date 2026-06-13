from rest_framework import generics, status, permissions
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework.views import APIView
from django.db.models import Q
from django.core.mail import send_mail
from django.conf import settings
from .models import Product, Cart, CartItem, Order, OrderItem, ContactMessage
from .serializers import (
    ProductSerializer, CartSerializer, CartItemSerializer,
    OrderSerializer, RegisterSerializer, UserSerializer, ContactMessageSerializer
)


# ── Products ──────────────────────────────────────────────────────

class ProductListView(generics.ListAPIView):
    serializer_class = ProductSerializer
    permission_classes = [permissions.AllowAny]

    def get_queryset(self):
        qs = Product.objects.all()
        category = self.request.query_params.get('category')
        search = self.request.query_params.get('search')
        if category and category != 'All':
            qs = qs.filter(category__iexact=category)
        if search:
            qs = qs.filter(
                Q(name__icontains=search) | Q(description__icontains=search)
            )
        return qs.order_by('-created_at')


class ProductDetailView(generics.RetrieveAPIView):
    serializer_class = ProductSerializer
    permission_classes = [permissions.AllowAny]
    queryset = Product.objects.all()


# ── Auth ──────────────────────────────────────────────────────────

class RegisterView(generics.CreateAPIView):
    serializer_class = RegisterSerializer
    permission_classes = [permissions.AllowAny]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(
            {'message': 'Account created successfully!', 'username': user.username},
            status=status.HTTP_201_CREATED
        )


class UserProfileView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        serializer = UserSerializer(request.user)
        return Response(serializer.data)


# ── Cart ──────────────────────────────────────────────────────────

class CartView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        cart, _ = Cart.objects.get_or_create(user=request.user)
        serializer = CartSerializer(cart)
        return Response(serializer.data)

    def post(self, request):
        """Add item to cart."""
        cart, _ = Cart.objects.get_or_create(user=request.user)
        product_id = request.data.get('product_id')
        quantity = int(request.data.get('quantity', 1))

        try:
            product = Product.objects.get(id=product_id)
        except Product.DoesNotExist:
            return Response(
                {'error': 'Product not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        item, created = CartItem.objects.get_or_create(
            cart=cart, product=product,
            defaults={'quantity': quantity}
        )
        if not created:
            item.quantity += quantity
            item.save()

        serializer = CartSerializer(cart)
        return Response(serializer.data, status=status.HTTP_200_OK)


class CartItemView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def put(self, request, item_id):
        """Update cart item quantity."""
        try:
            cart = Cart.objects.get(user=request.user)
            item = CartItem.objects.get(id=item_id, cart=cart)
        except (Cart.DoesNotExist, CartItem.DoesNotExist):
            return Response(
                {'error': 'Cart item not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        quantity = int(request.data.get('quantity', 1))
        if quantity <= 0:
            item.delete()
        else:
            item.quantity = quantity
            item.save()

        serializer = CartSerializer(cart)
        return Response(serializer.data)

    def delete(self, request, item_id):
        """Remove item from cart."""
        try:
            cart = Cart.objects.get(user=request.user)
            item = CartItem.objects.get(id=item_id, cart=cart)
        except (Cart.DoesNotExist, CartItem.DoesNotExist):
            return Response(
                {'error': 'Cart item not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        item.delete()
        serializer = CartSerializer(cart)
        return Response(serializer.data)


# ── Sync Guest Cart ──────────────────────────────────────────────

class CartSyncView(APIView):
    """Sync guest localStorage cart to server after login."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        cart, _ = Cart.objects.get_or_create(user=request.user)
        guest_items = request.data.get('items', [])

        for guest_item in guest_items:
            product_id = guest_item.get('id')
            quantity = guest_item.get('quantity', 1)
            try:
                product = Product.objects.get(id=product_id)
                item, created = CartItem.objects.get_or_create(
                    cart=cart, product=product,
                    defaults={'quantity': quantity}
                )
                if not created:
                    item.quantity = max(item.quantity, quantity)
                    item.save()
            except Product.DoesNotExist:
                continue

        serializer = CartSerializer(cart)
        return Response(serializer.data)


# ── Orders ────────────────────────────────────────────────────────

class OrderListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        orders = Order.objects.filter(user=request.user)
        serializer = OrderSerializer(orders, many=True)
        return Response(serializer.data)

    def post(self, request):
        """Create order from cart."""
        try:
            cart = Cart.objects.get(user=request.user)
        except Cart.DoesNotExist:
            return Response(
                {'error': 'Cart is empty'},
                status=status.HTTP_400_BAD_REQUEST
            )

        cart_items = cart.items.all()
        if not cart_items.exists():
            return Response(
                {'error': 'Cart is empty'},
                status=status.HTTP_400_BAD_REQUEST
            )

        address = request.data.get('address', '')
        if not address:
            return Response(
                {'error': 'Shipping address is required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Calculate total
        total = sum(item.get_total() for item in cart_items)

        # Create order
        order = Order.objects.create(
            user=request.user,
            total=total,
            address=address,
            status='confirmed'
        )

        # Create order items
        for cart_item in cart_items:
            OrderItem.objects.create(
                order=order,
                product=cart_item.product,
                quantity=cart_item.quantity,
                price=cart_item.product.price
            )

        # Clear cart
        cart_items.delete()

        serializer = OrderSerializer(order)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class ContactMessageView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = ContactMessageSerializer(data=request.data)
        if serializer.is_valid():
            contact = serializer.save()
            
            # Send an email notification to the site owner
            try:
                subject = f"New Contact Message from {contact.name}"
                message = f"You received a new message from your portfolio site:\n\nName: {contact.name}\nEmail: {contact.email}\n\nMessage:\n{contact.message}"
                send_mail(
                    subject,
                    message,
                    settings.EMAIL_HOST_USER,
                    ['tanmaynesty@gmail.com'], # The destination email
                    fail_silently=True,
                )
            except Exception as e:
                print(f"Error sending email: {e}")

            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
