from django.urls import path
from store.views import OrderListCreateView

urlpatterns = [
    path('', OrderListCreateView.as_view(), name='orders'),
]
