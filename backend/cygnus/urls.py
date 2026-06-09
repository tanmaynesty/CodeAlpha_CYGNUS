from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/token/', TokenObtainPairView.as_view()),
    path('api/token/refresh/', TokenRefreshView.as_view()),
    path('api/auth/', include('store.urls.auth')),
    path('api/products/', include('store.urls.products')),
    path('api/cart/', include('store.urls.cart')),
    path('api/orders/', include('store.urls.orders')),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)