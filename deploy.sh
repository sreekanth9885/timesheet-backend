#!/bin/bash

set -e

echo "Starting deployment..."

cd /docker/timesheet-api-backend

echo "Pulling latest code..."
git pull origin main

echo "Building Docker image..."
docker compose build api

echo "Restarting API..."
docker compose up -d api

echo "Cleaning unused images..."
docker image prune -f

echo "Deployment completed successfully!"
