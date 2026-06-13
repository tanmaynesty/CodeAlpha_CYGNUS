#!/bin/bash
echo "BUILD START"

# Create a virtual environment and activate it
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Run migrations and collectstatic
cd backend
python manage.py collectstatic --noinput --clear
python manage.py migrate

echo "BUILD END"
