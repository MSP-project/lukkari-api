#!/bin/bash

# Exit on non-zero exit status or unset variable
set -euv

# Build production
cd /var/www/lukkari-api/
# npm install
npm run build:prod

# Index.js without babel-register
cp /var/www/lukkari-api/index.production.js /var/www/lukkari-api/_build/index.js


# Install production dependencies
cp /var/www/lukkari-api/package.json /var/www/lukkari-api/_build/
cd /var/www/lukkari-api/_build/
npm install --production
