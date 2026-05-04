#!/usr/bin/env powershell
<#
.SYNOPSIS
    Quick Review Rating Test Script for Pustara
.DESCRIPTION
    Tests the complete review rating flow and helps debug issues
.PARAMETER BookId
    The UUID of the book to test
.EXAMPLE
    .\test-review.ps1 "550e8400-e29b-41d4-a716-446655440000"
#>

param(
    [string]$BookId = ""
)

$apiUrl = "http://localhost:3000"
$userId = "550e8400-e29b-41d4-a716-446655440001"
$rating = 4

if (-not $BookId) {
    Write-Host ""
    Write-Host "❌ Missing argument: Book ID required" -ForegroundColor Red
    Write-Host ""
    Write-Host "Usage:" -ForegroundColor Yellow
    Write-Host "  .\test-review.ps1 `"<BOOK_ID>`"" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Example:" -ForegroundColor Yellow
    Write-Host "  .\test-review.ps1 `"550e8400-e29b-41d4-a716-446655440000`"" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "How to find BOOK_ID:" -ForegroundColor Yellow
    Write-Host "  1. Go to book detail page in browser" -ForegroundColor Gray
    Write-Host "  2. URL will be: /book/{BOOK_ID}" -ForegroundColor Gray
    Write-Host "  3. Copy that BOOK_ID" -ForegroundColor Gray
    Write-Host ""
    exit 1
}

function Print-Header {
    param([string]$Title)
    Write-Host ""
    Write-Host "═" * 55 -ForegroundColor Cyan
    Write-Host $Title -ForegroundColor Cyan
    Write-Host "═" * 55 -ForegroundColor Cyan
}

function Print-Section {
    param([string]$Title, [int]$Step)
    Write-Host ""
    Write-Host "STEP $Step : $Title" -ForegroundColor Yellow
    Write-Host "━" * 55 -ForegroundColor Gray
}

function Test-Endpoint {
    param([string]$Endpoint, [string]$Description)
    try {
        $result = Invoke-RestMethod -Uri "$apiUrl$Endpoint" -ErrorAction Stop
        Write-Host "✅ $Description" -ForegroundColor Green
        return $result
    } catch {
        Write-Host "❌ $Description - $_" -ForegroundColor Red
        return $null
    }
}

# Header
Print-Header "📚 Pustara Review Rating Test"

Write-Host ""
Write-Host "Configuration:" -ForegroundColor Gray
Write-Host "  API URL    : $apiUrl" -ForegroundColor Gray
Write-Host "  Book ID    : $BookId" -ForegroundColor Gray
Write-Host "  User ID    : $userId" -ForegroundColor Gray
Write-Host "  Rating     : $rating ⭐" -ForegroundColor Gray

# Step 1: Check API Health
Print-Section "API Health Check" 1
$health = Test-Endpoint "/books" "Backend is running"
if (-not $health) { 
    Write-Host ""
    Write-Host "💡 Tip: Start backend with: npm start" -ForegroundColor Yellow
    exit 1 
}

# Step 2: Verify Book Exists
Print-Section "Verify Book Exists" 2
$bookBefore = Test-Endpoint "/books/$BookId" "Book found in database"
if (-not $bookBefore) { 
    Write-Host ""
    Write-Host "💡 Make sure you're using correct BOOK_ID from URL" -ForegroundColor Yellow
    exit 1 
}
Write-Host "  Title: $($bookBefore.data.title)" -ForegroundColor Gray
Write-Host "  Before: avg_rating=$($bookBefore.data.avg_rating)⭐, rating_count=$($bookBefore.data.rating_count)" -ForegroundColor Cyan

# Step 3: Submit Review
Print-Section "Submit Review" 3
$reviewBody = @{
    user_id = $userId
    book_id = $BookId
    rating = $rating
    review_text = "Test review - $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
} | ConvertTo-Json

try {
    $reviewResponse = Invoke-RestMethod -Uri "$apiUrl/reviews" `
        -Method POST `
        -ContentType "application/json" `
        -Body $reviewBody `
        -ErrorAction Stop
    
    Write-Host "✅ Review submitted successfully" -ForegroundColor Green
    if ($reviewResponse.data.book_stats) {
        Write-Host "  Response book_stats: avg_rating=$($reviewResponse.data.book_stats.avg_rating), rating_count=$($reviewResponse.data.book_stats.rating_count)" -ForegroundColor Cyan
    }
} catch {
    Write-Host "❌ Review submission failed: $_" -ForegroundColor Red
    Write-Host ""
    Write-Host "💡 Possible causes:" -ForegroundColor Yellow
    Write-Host "  - Invalid user_id format" -ForegroundColor Gray
    Write-Host "  - Invalid book_id format" -ForegroundColor Gray
    Write-Host "  - Database connection issue" -ForegroundColor Gray
    exit 1
}

# Step 4: Check Updated Values
Print-Section "Check Updated Values" 4
Start-Sleep -Milliseconds 500
$bookAfter = Test-Endpoint "/books/$BookId" "Book stats after submission"
if ($bookAfter) {
    $updated = $bookAfter.data.avg_rating -ne $bookBefore.data.avg_rating
    $symbol = if ($updated) { "✅" } else { "❌" }
    Write-Host "  After: avg_rating=$($bookAfter.data.avg_rating)⭐, rating_count=$($bookAfter.data.rating_count)" -ForegroundColor Cyan
    Write-Host "$symbol Values updated: $updated" -ForegroundColor $(if ($updated) { "Green" } else { "Red" })
}

# Step 5: Database Consistency Check
Print-Section "Database Consistency Check" 5
$debug = Test-Endpoint "/books/$BookId/debug" "Debug endpoint"
if ($debug) {
    $match = $debug.data.match
    Write-Host "  Book table stats: avg=$($debug.data.book_stats.avg_rating), count=$($debug.data.book_stats.rating_count)" -ForegroundColor Cyan
    Write-Host "  Reviews calc   : avg=$($debug.data.calculated_from_reviews.avg), count=$($debug.data.calculated_from_reviews.count)" -ForegroundColor Cyan
    $symbol = if ($match) { "✅" } else { "❌" }
    Write-Host "$symbol Consistency: $match" -ForegroundColor $(if ($match) { "Green" } else { "Red" })
    
    if (-not $match) {
        Write-Host ""
        Write-Host "⚠️  Database inconsistency detected!" -ForegroundColor Yellow
        Write-Host "   The books table has different values than the reviews table." -ForegroundColor Yellow
        Write-Host "   This suggests the UPDATE query didn't execute properly." -ForegroundColor Yellow
    }
}

# Step 6: List Reviews
Print-Section "List All Reviews" 6
$reviews = Test-Endpoint "/books/$BookId/reviews" "Fetch reviews"
if ($reviews -and $reviews.data) {
    Write-Host "  Total: $($reviews.data.Length) review(s)" -ForegroundColor Cyan
    $reviews.data | ForEach-Object {
        Write-Host "    ⭐ $($_.rating) - $($_.review_text)" -ForegroundColor Gray
    }
} else {
    Write-Host "  No reviews found" -ForegroundColor Yellow
}

# Summary
Print-Header "📊 Test Summary"

Write-Host ""
Write-Host "✅ All checks completed!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Check browser console for [DEBUG] messages" -ForegroundColor Gray
Write-Host "2. Verify the rating updates on the page" -ForegroundColor Gray
Write-Host "3. Clear browser cache if values don't update" -ForegroundColor Gray
Write-Host ""
Write-Host "📝 For detailed debugging, see: REVIEW_RATING_DEBUG_GUIDE.md" -ForegroundColor Cyan
Write-Host ""
