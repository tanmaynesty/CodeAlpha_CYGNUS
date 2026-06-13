#!/bin/bash
# Install dependencies
pip install -r requirements.txt

# Run migrations and collectstatic
cd backend
python manage.py collectstatic --noinput
python manage.py migrate
