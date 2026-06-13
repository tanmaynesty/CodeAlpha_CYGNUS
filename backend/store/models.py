from django.db import models
from django.contrib.auth.models import User


class Product(models.Model):
    name         = models.CharField(max_length=200)
    slug         = models.SlugField(max_length=200, unique=True, blank=True)
    description  = models.TextField()
    price        = models.DecimalField(max_digits=10, decimal_places=2)
    image        = models.ImageField(upload_to='products/', blank=True, null=True)
    image_url    = models.URLField(max_length=500, blank=True)
    stock        = models.IntegerField(default=0)
    in_stock     = models.BooleanField(default=True)
    category     = models.CharField(max_length=100, blank=True)
    rating       = models.DecimalField(max_digits=3, decimal_places=1, default=0)
    reviews_count = models.IntegerField(default=0)
    badge        = models.CharField(max_length=50, blank=True, null=True)
    features     = models.JSONField(default=list, blank=True)
    created_at   = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name

    def get_image(self):
        if self.image:
            return self.image.url
        return self.image_url or ''


class Cart(models.Model):
    user       = models.OneToOneField(User, on_delete=models.CASCADE)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.user.username}'s cart"


class CartItem(models.Model):
    cart     = models.ForeignKey(Cart, related_name='items', on_delete=models.CASCADE)
    product  = models.ForeignKey(Product, on_delete=models.CASCADE)
    quantity = models.IntegerField(default=1)

    class Meta:
        unique_together = ('cart', 'product')

    def get_total(self):
        return self.product.price * self.quantity


class Order(models.Model):
    STATUS_CHOICES = [
        ('pending',   'Pending'),
        ('confirmed', 'Confirmed'),
        ('shipped',   'Shipped'),
        ('delivered', 'Delivered'),
        ('cancelled', 'Cancelled'),
    ]
    user       = models.ForeignKey(User, on_delete=models.CASCADE, related_name='orders')
    total      = models.DecimalField(max_digits=10, decimal_places=2)
    status     = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    address    = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"Order #{self.id} by {self.user.username}"


class OrderItem(models.Model):
    order    = models.ForeignKey(Order, related_name='items', on_delete=models.CASCADE)
    product  = models.ForeignKey(Product, on_delete=models.CASCADE)
    quantity = models.IntegerField()
    price    = models.DecimalField(max_digits=10, decimal_places=2)

    def get_total(self):
        return self.price * self.quantity


class ContactMessage(models.Model):
    name = models.CharField(max_length=100)
    email = models.EmailField()
    message = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"Message from {self.name} ({self.email})"