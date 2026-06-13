#!/bin/bash
set -ex
echo "BUILD START"

# Create a virtual environment and activate it
python3 -m venv venv
. venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Run migrations and collectstatic
mkdir -p staticfiles
cd backend
python3 manage.py collectstatic --noinput --clear
python3 manage.py migrate

echo "BUILD END"
