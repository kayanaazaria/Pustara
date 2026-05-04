#!/bin/bash

# 🧪 Review Rating Debug Test Script
# This script helps test the full review flow

API_URL="http://localhost:3000"

echo "════════════════════════════════════════════════════════════"
echo "📚 Review Rating Debug Test"
echo "════════════════════════════════════════════════════════════"
echo ""

# Check if book ID provided
if [ -z "$1" ]; then
  echo "❌ Usage: ./test-review.sh <BOOK_ID>"
  echo ""
  echo "Example: ./test-review.sh 550e8400-e29b-41d4-a716-446655440000"
  exit 1
fi

BOOK_ID=$1
USER_ID="550e8400-e29b-41d4-a716-446655440001"  # Test user ID (you may need to change this)
RATING=4

echo "🔍 Testing with:"
echo "  Book ID: $BOOK_ID"
echo "  User ID: $USER_ID"
echo "  Rating: $RATING stars"
echo ""

# Step 1: Get current book stats
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "STEP 1: Get current book stats"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

BOOK_DATA=$(curl -s "$API_URL/books/$BOOK_ID")
echo "$BOOK_DATA" | jq '.data | {id, title, avg_rating, rating_count}' || echo "❌ Failed to fetch book"
echo ""

# Step 2: Submit a review
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "STEP 2: Submit review"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

REVIEW_RESPONSE=$(curl -s -X POST "$API_URL/reviews" \
  -H "Content-Type: application/json" \
  -d "{
    \"user_id\": \"$USER_ID\",
    \"book_id\": \"$BOOK_ID\",
    \"rating\": $RATING,
    \"review_text\": \"Test review - $(date +%s)\"
  }")

echo "$REVIEW_RESPONSE" | jq '.' || echo "❌ Review submission failed"
echo ""

# Step 3: Check updated book stats
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "STEP 3: Get updated book stats"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

sleep 1  # Wait for database to update

UPDATED_BOOK=$(curl -s "$API_URL/books/$BOOK_ID")
echo "$UPDATED_BOOK" | jq '.data | {id, title, avg_rating, rating_count}' || echo "❌ Failed to fetch updated book"
echo ""

# Step 4: Run debug endpoint
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "STEP 4: Check database consistency"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

DEBUG_DATA=$(curl -s "$API_URL/books/$BOOK_ID/debug")
echo "$DEBUG_DATA" | jq '.data' || echo "❌ Debug endpoint failed"
echo ""

# Step 5: Get all reviews for the book
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "STEP 5: List all reviews for this book"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

REVIEWS=$(curl -s "$API_URL/books/$BOOK_ID/reviews")
echo "$REVIEWS" | jq '.data | length' -r | xargs echo "Total reviews:"
echo "$REVIEWS" | jq '.data[] | {id, rating, review_text}' || echo "❌ Failed to fetch reviews"
echo ""

echo "════════════════════════════════════════════════════════════"
echo "✅ Test complete!"
echo "════════════════════════════════════════════════════════════"
