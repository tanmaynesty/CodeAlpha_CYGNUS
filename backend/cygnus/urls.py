from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from django.views.generic import TemplateView
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

urlpatterns = [
    path('admin/', admin.site.urls),

    # JWT auth endpoints
    path('api/token/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),

    # App API endpoints
    path('api/auth/', include('store.urls.auth')),
    path('api/products/', include('store.urls.products')),
    path('api/cart/', include('store.urls.cart')),
    path('api/orders/', include('store.urls.orders')),
    path('api/contact/', include('store.urls.contact')),

    # Serve the SPA frontend for all other routes
    path('', TemplateView.as_view(template_name='index.html'), name='home'),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)