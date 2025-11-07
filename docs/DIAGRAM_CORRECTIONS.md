# Diagram Corrections Guide (PowerPoint/draw.io)

## 3 Quick Fixes for Your Current Diagrams

### Fix #1: Split the Combined Lambda Box

**Current (Top Image):**
```
┌─────────────────────────┐
│ Lambda                  │
│ Comprehend + Bedrock    │
│ Summarize / Enrich      │
└─────────────────────────┘
```

**Change to:**
```
┌───────────────┐      ┌───────────────┐
│ Lambda        │  →   │ Lambda        │
│ Comprehend    │      │ Bedrock       │
│ Analyze       │      │ Summarize     │
└───────────────┘      └───────────────┘
```

**Instructions:**
1. Select the combined Lambda box
2. Copy and paste it to create a duplicate
3. First box text: "Lambda Comprehend Analyze"
4. Second box text: "Lambda Bedrock Summarize"
5. Position them in sequence (side by side or top to bottom)
6. Connect with arrow: Comprehend → Bedrock

---

### Fix #2: Add Store Metadata Lambda (CRITICAL - Missing)

**Add this new Lambda after Bedrock:**

```
┌───────────────┐
│ Lambda        │
│ Store         │
│ Metadata      │
└───────────────┘
```

**Instructions:**
1. Copy any existing red Lambda box
2. Paste below the Bedrock Lambda
3. Change text to: "Lambda Store Metadata"
4. Draw arrow FROM: Bedrock Lambda
5. Draw arrow TO: Store Metadata Lambda
6. Draw TWO arrows FROM Store Metadata:
   - Arrow 1 → DynamoDB Metadata Table
   - Arrow 2 → DynamoDB Document Names Table (see Fix #3)

**Why this matters:** This is the Lambda that actually writes all the results to DynamoDB. Without it, your diagram shows data going nowhere after Bedrock processing!

---

### Fix #3: Add Third DynamoDB Table

**Primary Region - Add this box:**
```
┌─────────────────────┐
│ DynamoDB            │
│ Document Names      │
│ Table               │
│ (primary)           │
└─────────────────────┘
```

**Secondary Region - Add this box:**
```
┌─────────────────────┐
│ DynamoDB            │
│ Document Names      │
│ (global replica)    │
│ 🛡️ Protected        │
└─────────────────────┘
```

**Instructions:**

**In Primary Region:**
1. Copy the "DynamoDB Metadata Table" box
2. Paste it next to the other DynamoDB boxes
3. Change text to: "DynamoDB Document Names Table (primary)"
4. Color: Keep same black color as other DynamoDB boxes

**In Secondary Region (us-east-2):**
1. Copy the "DynamoDB Metatable Table (global replica)" box
2. Paste it next to the other replica box
3. Change text to: "DynamoDB Document Names (global replica)"
4. Color: Keep same blue color as other replica boxes
5. Add "🛡️" symbol or text "Deletion Protection: ON"

**Add replication arrow:**
1. Draw dashed line from primary "Document Names" to replica
2. Label the arrow: "<1 second replication"
3. Make it match the style of other replication arrows

---

## Complete Lambda Function List (for reference)

**Copy these exact labels into your diagram:**

### Outside Step Functions (API Layer):
```
λ 1: Upload Handler function
     Purpose: Generate S3 presigned URLs

λ 2: Search / Metadata function
     Purpose: Query DynamoDB for documents
```

### Inside Step Functions Box (Processing Pipeline):
```
λ 3: Check Duplicate function
     Purpose: SHA-256 hash lookup

λ 4: Start Textract
     Purpose: Start async Textract job

λ 5: Check Textract Status
     Purpose: Poll job, extract text

λ 6: Comprehend Analyze         ← Split from combined box
     Purpose: Language, entities, phrases

λ 7: Bedrock Summarize          ← Split from combined box
     Purpose: AI summary & insights

λ 8: Store Metadata              ← NEW - Add this!
     Purpose: Write results to DynamoDB
```

**Total: 8 Lambda functions**

---

## Complete DynamoDB Table List

**Primary Region (us-west-2):**
```
1. DynamoDB Hash Registry (primary)
   - SHA-256 hashes
   - Duplicate detection

2. DynamoDB Metadata Table (primary)
   - Document metadata
   - Search index
   - Summaries & entities

3. DynamoDB Document Names (primary)      ← Add this!
   - Quick lookup registry
   - Document name index
```

**Secondary Region (us-east-2):**
```
1. DynamoDB Hash Registry (global replica)
   - 🛡️ Deletion Protection: ENABLED

2. DynamoDB Metatable Table (global replica)
   - 🛡️ Deletion Protection: ENABLED

3. DynamoDB Document Names (global replica)  ← Add this!
   - 🛡️ Deletion Protection: ENABLED
```

**Total: 3 tables × 2 regions = 6 DynamoDB resources**

---

## Processing Flow Arrows (Step Functions)

Update your arrow flow to show all 8 steps:

```
S3 Upload
  ↓
EventBridge
  ↓
Step Functions
  ↓
[1] Check Duplicate → DynamoDB Hash Registry
  ↓ (if new document)
[2] Start Textract → Amazon Textract
  ↓
[3] Check Textract Status → Amazon Textract
  ↓
[4] Comprehend Analyze → Amazon Comprehend      ← Split this
  ↓
[5] Bedrock Summarize → Amazon Bedrock          ← From combined
  ↓
[6] Store Metadata → DynamoDB Metadata Table    ← Add this step
                  → DynamoDB Document Names
```

---

## Box Placement Guide

### Recommended Layout (Top to Bottom):

```
Top Layer:
- Users (icon)

Second Layer:
- Primary Region (us-west-2) box start
  - CloudFront
  - Cognito User Pool
  - S3 Origin (React Frontend)

Third Layer:
- API Gateway
- Upload Handler Lambda (left)
- Search / Metadata Lambda (right)

Fourth Layer:
- S3 Document Bucket
- EventBridge

Fifth Layer:
- Step Functions box (large) containing:
  
  Row 1: λ Check Duplicate → DynamoDB Hash Registry
  
  Row 2: λ Start Textract
  
  Row 3: λ Check Textract Status
  
  Row 4: λ Comprehend Analyze        ← First of split pair
  
  Row 5: λ Bedrock Summarize         ← Second of split pair
  
  Row 6: λ Store Metadata            ← NEW row

AI Services (right side of Lambda functions):
- Textract
- Comprehend
- Bedrock

Bottom of Primary Region:
- DynamoDB Metadata Table
- DynamoDB Hash Registry  
- DynamoDB Document Names          ← Add this

Bottom Layer:
- Secondary Region (us-east-2) box with 3 replicas
```

---

## Color and Style Guide

### Colors to Use:

```
🔴 Red (#CC0000 or RGB: 204, 0, 0)
   - Lambda function boxes
   - Use AWS Lambda icon if available

⚫ Black
   - DynamoDB icons in primary region
   - Text labels

🔵 Blue (#527FFF or RGB: 82, 127, 255)
   - DynamoDB icons in secondary region (replicas)
   - Secondary region border

🟢 Green (#0D9043 or RGB: 13, 144, 67)
   - Textract, Comprehend, Bedrock service icons
   - AI service boxes

🟠 Orange/Brown
   - S3 bucket icons

🟣 Purple/Magenta
   - Step Functions icon
   - EventBridge icon
   - API Gateway icon
```

### Box Styles:

```
Primary Region border:
- Solid line
- Black or dark gray
- Rounded corners

Secondary Region border:
- Dashed line
- Blue color
- Rounded corners
- Label: "Secondary Region (us-east-2)"

Lambda functions:
- Small to medium size
- All same size
- Red background with white icon

DynamoDB tables:
- Medium size
- Primary: Black icon
- Replicas: Blue icon
```

### Arrow Styles:

```
Data flow (normal):
- Solid line
- Black color
- Arrow head at end
- Label on arrow for clarity

Replication:
- Dashed line
- Blue or gray color
- Double-headed arrow (optional)
- Label: "<1 sec" or "Sub-second replication"

Error flow:
- Solid line
- Red color
- To DLQ or error handler
```

---

## Text Labels to Add

### On Lambda Functions:
```
λ 1: Upload Handler
λ 2: Search Handler
λ 3: Check Duplicate
λ 4: Textract Start
λ 5: Textract Status
λ 6: Comprehend Analyze
λ 7: Bedrock Summarize
λ 8: Store Metadata
```

### On DynamoDB Tables (Primary):
```
DynamoDB Hash Registry (primary)
Purpose: Duplicate detection

DynamoDB Metadata Table (primary)
Purpose: Document metadata & search

DynamoDB Document Names (primary)
Purpose: Quick lookups
```

### On DynamoDB Replicas (Secondary):
```
DynamoDB Hash Registry (replica)
🛡️ Deletion Protection: ENABLED
Replication: <1 second

DynamoDB Metadata Table (replica)
🛡️ Deletion Protection: ENABLED
Replication: <1 second

DynamoDB Document Names (replica)
🛡️ Deletion Protection: ENABLED
Replication: <1 second
```

### On AI Services:
```
Amazon Textract
- Text extraction
- Table detection

Amazon Comprehend
- Language detection
- Entity extraction

Amazon Bedrock
- Claude Sonnet 4.5
- AI summarization
```

---

## PowerPoint-Specific Instructions

### If using PowerPoint:

1. **Insert Shapes:**
   - Insert → Shapes → Rounded Rectangle
   - Use consistent size for all Lambda functions

2. **Add Icons:**
   - Download AWS architecture icons: https://aws.amazon.com/architecture/icons/
   - Insert → Pictures → From File
   - Paste icon into each box

3. **Text Formatting:**
   - Font: Arial or Helvetica
   - Size: 10-12pt for labels, 8-10pt for details
   - Bold: Service names
   - Regular: Purpose/description

4. **Connectors:**
   - Insert → Shapes → Arrow
   - For replication: Line → Dashes → Dash style 2
   - Add text box on arrow for labels

5. **Group Elements:**
   - Select region border + all contents
   - Right-click → Group
   - Makes moving easier

---

## draw.io-Specific Instructions

### If using draw.io:

1. **AWS Icons:**
   - More Shapes (bottom left) → Search "AWS"
   - Enable "AWS Architecture 2021"
   - Drag and drop icons

2. **Duplicate Boxes:**
   - Select box → Ctrl+D (or Cmd+D on Mac)
   - Edit text inline

3. **Dashed Lines:**
   - Select line → Format panel (right side)
   - Line → Dashed → Select dash pattern

4. **Grouping:**
   - Select multiple items → Right-click → Group
   - Or use Ctrl+G (Cmd+G on Mac)

5. **Alignment:**
   - Select multiple boxes → Arrange → Align → Align Center
   - Keeps Lambda functions lined up nicely

---

## Validation Checklist

After making changes, verify:

```
□ Diagram shows 8 Lambda functions (count them!)
□ Comprehend and Bedrock are separate boxes
□ Store Metadata Lambda is present (after Bedrock)
□ 3 DynamoDB tables in primary region
□ 3 DynamoDB replicas in secondary region
□ All replicas show deletion protection
□ Replication arrows connect all 3 pairs
□ Step Functions box contains Lambda 3-8
□ Lambda 1-2 are outside Step Functions (API layer)
□ All arrows flow logically top to bottom
```

---

## Quick Reference Card (Print This)

```
╔═══════════════════════════════════════════════════════════╗
║            ACCURATE ARCHITECTURE COMPONENTS               ║
╠═══════════════════════════════════════════════════════════╣
║                                                           ║
║  LAMBDA FUNCTIONS: 8 total                                ║
║  ─────────────────────                                    ║
║  API Layer (outside Step Functions):                      ║
║    1. Upload Handler                                      ║
║    2. Search Handler                                      ║
║                                                           ║
║  Processing Pipeline (inside Step Functions):             ║
║    3. Check Duplicate                                     ║
║    4. Textract Start                                      ║
║    5. Textract Status                                     ║
║    6. Comprehend Analyze    ← MUST BE SEPARATE           ║
║    7. Bedrock Summarize     ← MUST BE SEPARATE           ║
║    8. Store Metadata        ← MUST ADD THIS              ║
║                                                           ║
║  DYNAMODB TABLES: 3 tables in each region                 ║
║  ────────────────────────────────────                     ║
║  Primary (us-west-2):                                     ║
║    1. Hash Registry                                       ║
║    2. Metadata Table                                      ║
║    3. Document Names        ← MUST ADD THIS              ║
║                                                           ║
║  DR (us-east-2):                                          ║
║    1. Hash Registry (replica) - Protected                 ║
║    2. Metadata Table (replica) - Protected                ║
║    3. Document Names (replica) - Protected ← MUST ADD    ║
║                                                           ║
║  REPLICATION ARROWS: 3 dashed lines                       ║
║  ──────────────────────────                               ║
║    Primary → DR (for each of 3 tables)                    ║
║    Label: "<1 sec" or "Sub-second"                        ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
```

---

## Diagram Update Summary

### What to Change:

| Item | Current | Change To |
|------|---------|-----------|
| Lambda count | 6-7 functions shown | 8 functions (add Store Metadata) |
| Comprehend+Bedrock | 1 combined box | 2 separate boxes |
| Store Metadata | Missing | Add as 8th Lambda |
| DynamoDB tables | 2 in primary | 3 in primary (add Document Names) |
| DynamoDB replicas | 2 in DR | 3 in DR (add Document Names replica) |
| Replication arrows | 2 dashed lines | 3 dashed lines (one for each table) |

**Time to update:** 10-15 minutes  
**Difficulty:** Easy (copy/paste existing elements)

---

## Final Architecture Counts (for accuracy)

```
✓ 1 CloudFront Distribution (global)
✓ 2 S3 Buckets (frontend + documents)
✓ 1 API Gateway
✓ 8 Lambda Functions (2 API + 6 processing)
✓ 1 Step Functions State Machine
✓ 1 EventBridge Rule
✓ 3 AI Services (Textract, Comprehend, Bedrock)
✓ 3 DynamoDB Tables (primary)
✓ 3 DynamoDB Replicas (DR region)
✓ 1 Cognito User Pool
✓ 1 CloudWatch Dashboard (optional to show)
✓ 1 SQS DLQ (optional to show)

Total Primary Resources: ~20 main components
Total DR Resources: 3 DynamoDB replicas
```

---

## Before and After

### BEFORE (Your Current Image 2):
```
Processing Pipeline contains:
- Check Duplicate Lambda → Hash Registry ✓
- Start Textract → Textract ✓
- Check Textract Status ✓
- Comprehend + Bedrock (COMBINED) ✗
- [Missing Store Metadata] ✗

Primary DynamoDB: 2 tables ✗
DR DynamoDB: 2 replicas ✗
```

### AFTER (Corrected):
```
Processing Pipeline contains:
- Check Duplicate Lambda → Hash Registry ✓
- Start Textract → Textract ✓
- Check Textract Status ✓
- Comprehend Analyze ✓ (SEPARATED)
- Bedrock Summarize ✓ (SEPARATED)
- Store Metadata ✓ (ADDED)

Primary DynamoDB: 3 tables ✓
DR DynamoDB: 3 replicas ✓
```

---

## Pro Tips

### For Clarity:
1. **Number your Lambda functions** (1-8) on the diagram
2. **Show arrows in sequence** (top to bottom or left to right)
3. **Label all arrows** (what data is flowing)
4. **Use consistent sizing** (all Lambda boxes same size)

### For Impact:
1. **Bold the "8 Lambda Functions"** in any title or legend
2. **Highlight "Store Metadata"** in green (final step)
3. **Add "🛡️" symbol** to DR region tables
4. **Show replication timing** ("<1 sec") on arrows

### For Professional Look:
1. **Align all Lambda boxes** (use alignment tools)
2. **Consistent spacing** between elements
3. **Clean arrow routing** (avoid diagonal crosses)
4. **Legend box** showing what colors mean (optional)

---

## Export Settings

### For Presentations (PowerPoint/Keynote):
- Format: PNG
- Resolution: 300 DPI (high quality)
- Size: 1920×1080 (Full HD) or 3840×2160 (4K)

### For Documentation (PDF):
- Format: PDF (vector - scales perfectly)
- Or SVG (best quality, smallest file size)

### For Web (GitHub, Wiki):
- Format: SVG (best) or PNG
- Resolution: 150-200 DPI
- Optimize file size if > 1MB

---

## Common Mistakes to Avoid

```
✗ Don't combine Comprehend and Bedrock into one box
✗ Don't forget Store Metadata Lambda (critical!)
✗ Don't show only 2 DynamoDB tables (there are 3)
✗ Don't forget to show replication for all 3 tables
✗ Don't skip the deletion protection symbols in DR
✗ Don't make Lambda boxes different sizes (keep consistent)
✗ Don't use non-AWS icons (stick to official AWS architecture icons)
```

---

## Need Help?

**If you're stuck on any step:**

1. **Lambda function details:** See `backend/lib/simplified-doc-processor-stack.ts` lines 337-522
2. **DynamoDB tables:** See deployment outputs (3 table names listed)
3. **Step Functions flow:** See `README.md` "How It Works" section
4. **Visual reference:** See ASCII diagrams in `docs/MULTI_REGION_ARCHITECTURE.md`

**The corrections are straightforward copy/paste operations - should take 10-15 minutes total!**

