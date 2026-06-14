import os
import sys

# Add the 'backend' directory to the Python path so Vercel can find the 'cygnus' module
path = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if path not in sys.path:
    sys.path.insert(0, path)

from django.core.wsgi import get_wsgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'cygnus.settings')

application = get_wsgi_application()
# Vercel Serverless Functions often look for an object named 'app'
app = application
