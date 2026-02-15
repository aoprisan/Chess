#!/bin/bash

# Deploy Script for Kiddie Chess
# Builds the full release (frontend + backend) and deploys to EC2.

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
BUILD_DIR="dist"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
VERSION=${VERSION:-"1.0.0"}
RELEASE_NAME="kiddiechess-${VERSION}-${TIMESTAMP}"
RELEASE_DIR="${BUILD_DIR}/${RELEASE_NAME}"

# SSH/Remote Configuration (uses ssh-add, no key file)
REMOTE_HOST="ec2-user@35.156.232.123"
REMOTE_DIR="~/chess/"

echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}  Kiddie Chess - Build & Deploy to EC2${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""

# ──────────────────────────────────────────────
# Step 1: Build Flutter web frontend
# ──────────────────────────────────────────────
echo -e "${YELLOW}[1/4] Building Flutter web frontend...${NC}"

rm -rf ${BUILD_DIR}
mkdir -p ${RELEASE_DIR}

cd client
flutter pub get
flutter build web

if [ ! -d "build/web" ]; then
    echo -e "${RED}✗ Frontend build failed - build/web directory not found${NC}"
    exit 1
fi

FRONTEND_SIZE=$(du -sh build/web | cut -f1)
echo -e "${GREEN}✓ Frontend build complete (${FRONTEND_SIZE})${NC}"
cd ..
echo ""

# ──────────────────────────────────────────────
# Step 2: Build Go backend (linux/amd64)
# ──────────────────────────────────────────────
echo -e "${YELLOW}[2/4] Building Go backend...${NC}"
cd server

if [ "${SKIP_TESTS}" != "true" ]; then
    echo "  → Running tests..."
    go test ./... > /dev/null 2>&1 || {
        echo -e "${RED}✗ Tests failed${NC}"
        exit 1
    }
    echo -e "${GREEN}  ✓ All tests passed${NC}"
else
    echo -e "${YELLOW}  ⊘ Tests skipped (SKIP_TESTS=true)${NC}"
fi

echo "  → Building Go binary (linux/amd64)..."
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -o ../dist/kiddiechess-server cmd/server/main.go

if [ ! -f "../dist/kiddiechess-server" ]; then
    echo -e "${RED}✗ Go build failed - binary not found${NC}"
    exit 1
fi

BINARY_SIZE=$(du -sh ../dist/kiddiechess-server | cut -f1)
echo -e "${GREEN}✓ Backend build complete (${BINARY_SIZE})${NC}"
cd ..
echo ""

# ──────────────────────────────────────────────
# Step 3: Package release
# ──────────────────────────────────────────────
echo -e "${YELLOW}[3/4] Packaging release...${NC}"

echo "  → Copying backend binary..."
cp dist/kiddiechess-server ${RELEASE_DIR}/

echo "  → Copying frontend build..."
cp -r client/build/web ${RELEASE_DIR}/frontend

echo "  → Creating configuration files..."
cat > ${RELEASE_DIR}/.env << 'EOF'
# Kiddie Chess Production Configuration
PORT=9090
DB_PATH=./data/kiddiechess.db
WEB_DIR=./frontend
EOF

echo "  → Creating startup script..."
cat > ${RELEASE_DIR}/start.sh << 'EOF'
#!/bin/bash

# Kiddie Chess Startup Script

# Load environment variables
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

# Create data directory if it doesn't exist
mkdir -p data

# Start the server
echo "Starting Kiddie Chess server on port ${PORT:-8080}..."
./kiddiechess-server
EOF
chmod +x ${RELEASE_DIR}/start.sh

# Create zip archive
cd ${BUILD_DIR}
zip -r ${RELEASE_NAME}.zip ${RELEASE_NAME} > /dev/null 2>&1

if [ ! -f "${RELEASE_NAME}.zip" ]; then
    echo -e "${RED}✗ Zip creation failed${NC}"
    exit 1
fi

ZIP_SIZE=$(du -sh ${RELEASE_NAME}.zip | cut -f1)
cd ..

echo -e "${GREEN}✓ Release packaged (${ZIP_SIZE})${NC}"
echo ""

# ──────────────────────────────────────────────
# Step 4: Upload & deploy to EC2
# ──────────────────────────────────────────────
echo -e "${YELLOW}[4/4] Deploying to EC2...${NC}"

ZIP_FILE="${BUILD_DIR}/${RELEASE_NAME}.zip"

echo "  → Uploading ${RELEASE_NAME}.zip to ${REMOTE_HOST}:${REMOTE_DIR}..."
scp -o StrictHostKeyChecking=no "${ZIP_FILE}" "${REMOTE_HOST}:${REMOTE_DIR}"

echo "  → Extracting on remote host..."
ssh -o StrictHostKeyChecking=no "${REMOTE_HOST}" \
    "cd ${REMOTE_DIR} && unzip -o ${RELEASE_NAME}.zip && cp -rf ${RELEASE_NAME}/. . && rm -rf ${RELEASE_NAME} ${RELEASE_NAME}.zip"

echo -e "${GREEN}✓ Deployed to ${REMOTE_HOST}:${REMOTE_DIR}${NC}"
echo ""

# ──────────────────────────────────────────────
# Summary
# ──────────────────────────────────────────────
echo -e "${BLUE}================================================${NC}"
echo -e "${GREEN}  Deploy Complete!${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""
echo -e "Release: ${GREEN}${RELEASE_NAME}${NC}"
echo -e "Size:    ${GREEN}${ZIP_SIZE}${NC}"
echo -e "Host:    ${GREEN}${REMOTE_HOST}${NC}"
echo -e "Path:    ${GREEN}${REMOTE_DIR}${NC}"
echo ""
echo -e "Contents deployed:"
echo -e "  • Go server binary (${BINARY_SIZE})"
echo -e "  • Flutter web frontend (${FRONTEND_SIZE})"
echo -e "  • Configuration files"
echo ""
echo -e "${BLUE}To SSH in:${NC}"
echo -e "  ssh ${REMOTE_HOST}"
echo ""
echo -e "${BLUE}To start:${NC}"
echo -e "  cd ${REMOTE_DIR} && ./start.sh"
echo ""
echo -e "${BLUE}================================================${NC}"
