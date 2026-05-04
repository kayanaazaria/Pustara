#!/usr/bin/env node
/**
 * Module Export Verification Script
 * 
 * Purpose: Verify that getTrendingBooks is properly exported and only exists once
 * Helps detect duplicate exports, conflicts, or missing implementations
 * 
 * Usage:
 *   node verify-exports.js
 * 
 * Output:
 *   ✅ Green = OK, function correctly exported
 *   ❌ Red = PROBLEM, needs fix
 */

const fs = require('fs');
const path = require('path');

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(color, message) {
  console.log(`${color}${message}${colors.reset}`);
}

function readFile(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    return null;
  }
}

function findMatches(content, pattern) {
  const regex = new RegExp(pattern, 'g');
  const matches = [];
  let match;
  
  while ((match = regex.exec(content)) !== null) {
    // Get line number
    const lineNum = content.substring(0, match.index).split('\n').length;
    matches.push({
      lineNum,
      text: match[0],
      index: match.index,
    });
  }
  
  return matches;
}

// ============================================================================
// VERIFICATION 1: Check for Multiple getTrendingBooks Exports
// ============================================================================

function verifyExports() {
  log(colors.cyan, '\n📋 VERIFICATION 1: Multiple getTrendingBooks Exports\n');
  
  const backendDir = path.join(__dirname, 'backend');
  const filestoCheck = [
    'controllers/booksController.js',
    'routes/booksRoutes.js',
    'routes/recommendations.js',
    'BEST_PRACTICES_EXAMPLE.js',
  ];
  
  const exportMatches = new Map();
  let totalExports = 0;
  
  for (const file of filestoCheck) {
    const filePath = path.join(backendDir, file);
    const content = readFile(filePath);
    
    if (!content) {
      log(colors.yellow, `⚠️  ${file} not found`);
      continue;
    }
    
    // Look for exports.getTrendingBooks
    const matches = findMatches(content, 'exports\\.getTrendingBooks\\s*=');
    
    if (matches.length > 0) {
      exportMatches.set(file, matches);
      totalExports += matches.length;
      
      if (matches.length === 1) {
        log(colors.green, `✅ ${file} - 1 export (GOOD)`);
      } else {
        log(colors.red, `❌ ${file} - ${matches.length} exports (DUPLICATE!)`);
        matches.forEach((m) => {
          log(colors.red, `   Line ${m.lineNum}: ${m.text}`);
        });
      }
    }
  }
  
  log(colors.blue, `\n📊 Summary: ${totalExports} getTrendingBooks exports found`);
  
  if (totalExports === 1) {
    log(colors.green, '✅ Single source of truth confirmed!\n');
    return true;
  } else if (totalExports === 0) {
    log(colors.red, '❌ NO getTrendingBooks export found! Function missing!\n');
    return false;
  } else {
    log(colors.red, `❌ CONFLICT! ${totalExports} exports found. Should be exactly 1.\n`);
    return false;
  }
}

// ============================================================================
// VERIFICATION 2: Check Route Registration
// ============================================================================

function verifyRouteRegistration() {
  log(colors.cyan, '📋 VERIFICATION 2: Route Registration\n');
  
  const routesFile = path.join(__dirname, 'backend/routes/booksRoutes.js');
  const content = readFile(routesFile);
  
  if (!content) {
    log(colors.red, '❌ booksRoutes.js not found\n');
    return false;
  }
  
  // Check if booksController is imported
  const hasImport = content.includes("require('../controllers/booksController')");
  if (hasImport) {
    log(colors.green, '✅ booksController correctly imported');
  } else {
    log(colors.red, '❌ booksController NOT imported');
    return false;
  }
  
  // Check if router.get('/books/trending', ...) exists
  const hasRoute = /router\.get\s*\(\s*['\"]\/books\/trending['\"]\s*,\s*booksController\.getTrendingBooks\s*\)/.test(content);
  if (hasRoute) {
    log(colors.green, '✅ Route registration correct');
    log(colors.green, '   router.get(\"/books/trending\", booksController.getTrendingBooks)');
  } else {
    log(colors.red, '❌ Route registration missing or incorrect');
    return false;
  }
  
  log('');
  return true;
}

// ============================================================================
// VERIFICATION 3: Check Function Implementation
// ============================================================================

function verifyImplementation() {
  log(colors.cyan, '📋 VERIFICATION 3: Function Implementation\n');
  
  const controllerFile = path.join(__dirname, 'backend/controllers/booksController.js');
  const content = readFile(controllerFile);
  
  if (!content) {
    log(colors.red, '❌ booksController.js not found\n');
    return false;
  }
  
  // Check for key implementation details
  const checks = [
    { 
      pattern: 'exports\\.getTrendingBooks\\s*=\\s*async\\s*\\(',
      label: 'Async function declaration',
    },
    {
      pattern: 'db\\.executeQuery',
      label: 'Database query execution',
    },
    {
      pattern: 'ORDER BY.*COALESCE\\(review_count',
      label: 'Review count sorting (PRIMARY)',
    },
    {
      pattern: 'toRows\\(',
      label: 'Row transformation',
    },
    {
      pattern: 'withDownloadUrl',
      label: 'URL download transformation',
    },
    {
      pattern: 'res\\.json',
      label: 'JSON response',
    },
    {
      pattern: 'requestId',
      label: 'Request ID logging',
    },
  ];
  
  let allPresent = true;
  
  for (const check of checks) {
    const regex = new RegExp(check.pattern);
    if (regex.test(content)) {
      log(colors.green, `✅ ${check.label}`);
    } else {
      log(colors.red, `❌ ${check.label} - NOT FOUND`);
      allPresent = false;
    }
  }
  
  log('');
  return allPresent;
}

// ============================================================================
// VERIFICATION 4: Check for Fetch Calls (Should NOT exist in getTrendingBooks)
// ============================================================================

function verifyNoFetchInGetTrendingBooks() {
  log(colors.cyan, '📋 VERIFICATION 4: No Fetch in getTrendingBooks\n');
  
  const controllerFile = path.join(__dirname, 'backend/controllers/booksController.js');
  const content = readFile(controllerFile);
  
  if (!content) {
    log(colors.red, '❌ booksController.js not found\n');
    return false;
  }
  
  // Extract getTrendingBooks function
  const funcMatch = content.match(
    /exports\.getTrendingBooks\s*=\s*async\s*\([\s\S]*?\n\};\n/
  );
  
  if (!funcMatch) {
    log(colors.red, '❌ Could not extract getTrendingBooks function\n');
    return false;
  }
  
  const funcBody = funcMatch[0];
  
  // Check for fetch calls (should NOT exist)
  const hasFetch = /await\s+fetch\s*\(|fetch\s*\(/.test(funcBody);
  
  if (hasFetch) {
    log(colors.red, '❌ PROBLEM: getTrendingBooks contains fetch() call');
    log(colors.red, '   This function should ONLY query database, not fetch!');
    log('');
    return false;
  } else {
    log(colors.green, '✅ getTrendingBooks does NOT contain fetch()');
    log(colors.green, '   Function is database-only (as expected)');
    log('');
    return true;
  }
}

// ============================================================================
// VERIFICATION 5: Check Index.js Route Mounting
// ============================================================================

function verifyIndexMounting() {
  log(colors.cyan, '📋 VERIFICATION 5: Route Mounting in index.js\n');
  
  const indexFile = path.join(__dirname, 'backend/index.js');
  const content = readFile(indexFile);
  
  if (!content) {
    log(colors.red, '❌ index.js not found\n');
    return false;
  }
  
  // Check mounting order
  const booksRoutesMatch = content.match(/app\.use\s*\(\s*['\"]\/['\"],\s*booksRoutes\s*\)/);
  const recommendationsMatch = content.match(/app\.use\s*\(\s*['\"]\/recommendations['\"]/);
  
  if (!booksRoutesMatch) {
    log(colors.red, '❌ booksRoutes not mounted');
    return false;
  }
  
  if (!recommendationsMatch) {
    log(colors.red, '❌ recommendationsRoutes not mounted');
    return false;
  }
  
  // Check order (recommendations should come before books '/')
  const booksIndex = content.indexOf(booksRoutesMatch[0]);
  const recoIndex = content.indexOf(recommendationsMatch[0]);
  
  if (recoIndex < booksIndex) {
    log(colors.green, '✅ Correct mounting order');
    log(colors.green, '   /recommendations routes mounted FIRST');
    log(colors.green, '   / (booksRoutes) mounted SECOND');
  } else {
    log(colors.red, '❌ WRONG mounting order');
    log(colors.red, '   / routes will catch /recommendations!');
    return false;
  }
  
  log('');
  return true;
}

// ============================================================================
// MAIN
// ============================================================================

function main() {
  log(colors.blue, '\n' + '='.repeat(70));
  log(colors.blue, 'Module Export Verification Tool');
  log(colors.blue, '='.repeat(70));
  
  const results = {
    exports: verifyExports(),
    registration: verifyRouteRegistration(),
    implementation: verifyImplementation(),
    noFetch: verifyNoFetchInGetTrendingBooks(),
    mounting: verifyIndexMounting(),
  };
  
  // Summary
  log(colors.blue, '='.repeat(70));
  log(colors.blue, '📊 SUMMARY\n');
  
  const allPass = Object.values(results).every(r => r);
  
  if (allPass) {
    log(colors.green, '✅ ALL CHECKS PASSED!');
    log(colors.green, 'getTrendingBooks is properly set up:');
    log(colors.green, '  • Exported exactly once');
    log(colors.green, '  • Route registered correctly');
    log(colors.green, '  • Implementation complete');
    log(colors.green, '  • No fetch() calls in database function');
    log(colors.green, '  • Routes mounted in correct order');
  } else {
    log(colors.red, '❌ SOME CHECKS FAILED\n');
    
    Object.entries(results).forEach(([check, passed]) => {
      const status = passed ? '✅' : '❌';
      log(colors.yellow, `${status} ${check}`);
    });
    
    log(colors.red, '\nFix the issues above before running the server!');
  }
  
  log(colors.blue, '='.repeat(70) + '\n');
  
  process.exit(allPass ? 0 : 1);
}

main();
