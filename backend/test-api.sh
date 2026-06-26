#!/bin/bash

# Setup console colors
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color
YELLOW='\033[1;33m'

echo -e "${YELLOW}====================================================${NC}"
echo -e "${YELLOW}       Chain of Custody Backend API Test Runner     ${NC}"
echo -e "${YELLOW}====================================================${NC}"

BACKEND_URL="http://localhost:4000"

# 1. Create a sample evidence file
SAMPLE_FILE="evidence-sample.txt"
echo "Confidential Forensic Evidence Log File - Case CASE-701" > $SAMPLE_FILE
EXPECTED_HASH=$(shasum -a 256 $SAMPLE_FILE | awk '{print $1}')
echo -e "Created sample file: ${SAMPLE_FILE}"
echo -e "Sample file SHA-256: ${GREEN}${EXPECTED_HASH}${NC}"

# Helper function to print API headers
print_step() {
  echo -e "\n${YELLOW}Step $1: $2${NC}"
  echo "----------------------------------------------------"
}

# Step 1: Register evidence without CA authentication (Should Fail)
print_step "1" "Register evidence without authentication header (Expecting 401)"
curl -s -o /dev/null -w "%{http_code}" -X POST "$BACKEND_URL/evidence/register" \
  -F "evidenceId=EVID-992" \
  -F "caseId=CASE-701" \
  -F "officerId=Officer_Smith" \
  -F "file=@$SAMPLE_FILE" > status_code.txt
STATUS=$(cat status_code.txt)
if [ "$STATUS" -eq 401 ]; then
  echo -e "${GREEN}SUCCESS: Request was correctly blocked with status 401 (Unauthorized)${NC}"
else
  echo -e "${RED}FAILED: Request returned status $STATUS (Expected 401)${NC}"
fi

# Step 2: Register a new officer with Fabric CA
print_step "2" "Register Officer_Smith with Fabric CA"
REG_RESPONSE=$(curl -s -X POST "$BACKEND_URL/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"username": "Officer_Smith", "role": "client"}')
echo "Response: $REG_RESPONSE"

SECRET=$(echo $REG_RESPONSE | grep -o '"enrollmentSecret":"[^"]*' | grep -o '[^"]*$')
if [ ! -z "$SECRET" ]; then
  echo -e "${GREEN}SUCCESS: Registered officer. Secret code: $SECRET${NC}"
else
  echo -e "${RED}FAILED: Could not register officer.${NC}"
  exit 1
fi

# Step 3: Enroll Officer_Smith to obtain certificates/keys
print_step "3" "Enroll Officer_Smith with Fabric CA"
ENROLL_RESPONSE=$(curl -s -X POST "$BACKEND_URL/auth/enroll" \
  -H "Content-Type: application/json" \
  -d "{\"username\": \"Officer_Smith\", \"secret\": \"$SECRET\"}")
echo "Response: $ENROLL_RESPONSE"

if [[ "$ENROLL_RESPONSE" == *"successfully enrolled"* ]]; then
  echo -e "${GREEN}SUCCESS: Officer credentials stored in local wallet${NC}"
else
  echo -e "${RED}FAILED: Could not enroll officer${NC}"
  exit 1
fi

# Step 4: Try registering evidence with an unenrolled officer identity
print_step "4" "Attempt registration with unenrolled officer (Expecting 403)"
curl -s -o /dev/null -w "%{http_code}" -X POST "$BACKEND_URL/evidence/register" \
  -H "x-officer-id: Officer_Unenrolled" \
  -F "evidenceId=EVID-992" \
  -F "caseId=CASE-701" \
  -F "officerId=Officer_Unenrolled" \
  -F "file=@$SAMPLE_FILE" > status_code.txt
STATUS=$(cat status_code.txt)
if [ "$STATUS" -eq 403 ]; then
  echo -e "${GREEN}SUCCESS: Correctly forbidden with status 403${NC}"
else
  echo -e "${RED}FAILED: Returned status $STATUS (Expected 403)${NC}"
fi

# Step 5: Register evidence with enrolled officer
print_step "5" "Register evidence by uploading file (Enrolled Officer)"
REG_EVID_RESPONSE=$(curl -s -X POST "$BACKEND_URL/evidence/register" \
  -H "x-officer-id: Officer_Smith" \
  -F "evidenceId=EVID-992" \
  -F "caseId=CASE-701" \
  -F "officerId=Officer_Smith" \
  -F "file=@$SAMPLE_FILE")
echo "Response: $REG_EVID_RESPONSE"

if [[ "$REG_EVID_RESPONSE" == *"successfully registered"* ]]; then
  echo -e "${GREEN}SUCCESS: Evidence registered on blockchain ledger${NC}"
else
  echo -e "${RED}FAILED: Could not register evidence${NC}"
  exit 1
fi

# Step 6: Transfer Custody to ForensicsLab (Needs authentication)
print_step "6" "Transfer custody of evidence to ForensicsLab"
TRANSFER_RESPONSE=$(curl -s -X POST "$BACKEND_URL/evidence/transfer" \
  -H "Content-Type: application/json" \
  -H "x-officer-id: Officer_Smith" \
  -d '{
    "evidenceId": "EVID-992",
    "fromOrg": "PoliceDept",
    "toOrg": "ForensicsLab",
    "reason": "Chemical testing & Fingerprint analysis"
  }')
echo "Response: $TRANSFER_RESPONSE"

if [[ "$TRANSFER_RESPONSE" == *"Custody successfully transferred"* ]]; then
  echo -e "${GREEN}SUCCESS: Custody log recorded on ledger${NC}"
else
  echo -e "${RED}FAILED: Could not transfer custody${NC}"
  exit 1
fi

# Step 7: Verify Integrity - SUCCESS CASE (provide correct hash)
print_step "7" "Verify integrity with CORRECT hash (Expecting verified: true)"
VERIFY_GOOD_RESPONSE=$(curl -s -X GET "$BACKEND_URL/evidence/verify/EVID-992?providedHash=$EXPECTED_HASH")
echo "Response: $VERIFY_GOOD_RESPONSE"

if [[ "$VERIFY_GOOD_RESPONSE" == *"\"verified\":true"* ]]; then
  echo -e "${GREEN}SUCCESS: Evidence verified authentic (No tampering detected)${NC}"
else
  echo -e "${RED}FAILED: Verification failed on correct hash${NC}"
  exit 1
fi

# Step 8: Verify Integrity - TAMPERED CASE (provide incorrect hash)
print_step "8" "Verify integrity with BAD hash (Expecting verified: false)"
BAD_HASH="b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9"
VERIFY_BAD_RESPONSE=$(curl -s -X GET "$BACKEND_URL/evidence/verify/EVID-992?providedHash=$BAD_HASH")
echo "Response: $VERIFY_BAD_RESPONSE"

if [[ "$VERIFY_BAD_RESPONSE" == *"\"verified\":false"* ]]; then
  echo -e "${GREEN}SUCCESS: System detected tampering (verification false)${NC}"
else
  echo -e "${RED}FAILED: Tampering went undetected${NC}"
  exit 1
fi

# Step 9: Verify Integrity by Uploading File
print_step "9" "Verify integrity by uploading the file directly"
VERIFY_FILE_RESPONSE=$(curl -s -X GET "$BACKEND_URL/evidence/verify/EVID-992" \
  -F "file=@$SAMPLE_FILE")
echo "Response: $VERIFY_FILE_RESPONSE"

if [[ "$VERIFY_FILE_RESPONSE" == *"\"verified\":true"* ]]; then
  echo -e "${GREEN}SUCCESS: File verified authentic directly through file upload${NC}"
else
  echo -e "${RED}FAILED: Direct file verification failed${NC}"
  exit 1
fi

# Step 10: Fetch Chain of Custody History
print_step "10" "Retrieve full Chain of Custody history timeline"
HISTORY_RESPONSE=$(curl -s -X GET "$BACKEND_URL/evidence/history/EVID-992")
echo "Response: $HISTORY_RESPONSE"

if [[ "$HISTORY_RESPONSE" == *"history"* ]]; then
  echo -e "${GREEN}SUCCESS: Received full transaction timeline from chain${NC}"
else
  echo -e "${RED}FAILED: Could not retrieve timeline history${NC}"
  exit 1
fi

# Clean up
rm -f $SAMPLE_FILE status_code.txt
echo -e "\n${GREEN}====================================================${NC}"
echo -e "${GREEN}             All API Tests Passed!                  ${NC}"
echo -e "${GREEN}====================================================${NC}"
