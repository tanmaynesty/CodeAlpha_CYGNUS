from django.urls import path
from store.views import CartView, CartItemView, CartSyncView

urlpatterns = [
    path('', CartView.as_view(), name='cart'),
    path('sync/', CartSyncView.as_view(), name='cart-sync'),
    path('<int:item_id>/', CartItemView.as_view(), name='cart-item'),
]
