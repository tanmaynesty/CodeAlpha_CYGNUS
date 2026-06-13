#!/bin/bash
echo "BUILD START"

# Install dependencies
python3 -m pip install -r requirements.txt

# Run migrations and collectstatic
cd backend
python3 manage.py collectstatic --noinput --clear
python3 manage.py migrate

echo "BUILD END"
