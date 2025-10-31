# OpenSearch Need Analysis

## Current Capabilities (DynamoDB Only)

### ✅ What You CAN Search Today

1. **By Document ID** - Get specific document metadata
   ```bash
   GET /metadata/{documentId}
   ```

2. **By Language** - Find all documents in a specific language
   ```bash
   GET /search?language=en
   ```

3. **By Metadata** - Filter by:
   - Entities (people, places, organizations)
   - Key phrases
   - Processing date
   - Document summary
   - Insights
   - Structured data (dates, amounts, locations)

4. **Full Document Metadata** - Access:
   - Extracted entities (all people, places, organizations)
   - All key phrases
   - Document summary (from Bedrock)
   - Intelligent insights (from Bedrock)
   - Structured data (dates, amounts, names, locations, orgs)
   - Language
   - Processing date

### ❌ What You CANNOT Search Today

1. **Full-Text Search** - Cannot search inside the entire document text
   - DynamoDB only stores first 10k characters in metadata table
   - Full document text remains in S3 only

2. **Semantic Search** - Cannot find documents by meaning/concept
   - No vector embeddings
   - No similarity matching

3. **Complex Text Queries** - Cannot do:
   - Fuzzy matching
   - Phrase queries
   - Boolean queries (AND/OR across document text)
   - Proximity searches

## Use Case Analysis

### Scenario 1: Search by Extracted Metadata ✅ (DynamoDB is Sufficient)

**Use Case**: "Find all documents that mention 'John Smith' or contain the phrase 'budget proposal'"

**Current Solution**:
- ✅ Search entities (people: "John Smith")
- ✅ Search key phrases ("budget proposal")
- ✅ Filter by language, date, etc.

**OpenSearch Needed**: ❌ **NO** - DynamoDB can handle this

---

### Scenario 2: Search Inside Document Text ❌ (OpenSearch Needed)

**Use Case**: "Find documents containing the exact phrase 'quarterly earnings report' anywhere in the document text"

**Current Solution**:
- ❌ DynamoDB only has first 10k chars
- ❌ Full document text is in S3 (not searchable)

**OpenSearch Needed**: ✅ **YES** - Would need to index full document text

---

### Scenario 3: Semantic Search ❌ (OpenSearch Needed)

**Use Case**: "Find documents similar to this one" or "Find documents about financial planning"

**Current Solution**:
- ❌ No vector embeddings
- ❌ No similarity matching

**OpenSearch Needed**: ✅ **YES** - Would need vector search capabilities

---

## Recommendation

### Start WITHOUT OpenSearch ✅

**Reasons**:
1. ✅ **Lower Cost** - DynamoDB only costs ~$1.25/million requests
2. ✅ **Simpler** - No VPC, no cluster management
3. ✅ **Faster Deployment** - No OpenSearch provisioning time
4. ✅ **SCP Compliant** - No public resources
5. ✅ **Meets Most Use Cases** - Metadata search covers 80-90% of needs

### Add OpenSearch Later IF Needed

**Add OpenSearch ONLY if**:
- ❓ Users need to search inside full document text (not just metadata)
- ❓ Users need semantic/similarity search
- ❓ Users need complex text queries (fuzzy, phrase, boolean)

## Cost Comparison

### DynamoDB Only (Current)
- **Storage**: Free tier (first 25GB free)
- **Requests**: ~$1.25 per million requests
- **Monthly Cost**: ~$5-20 for moderate usage

### DynamoDB + OpenSearch (If Added)
- **DynamoDB**: Same as above
- **OpenSearch**: 
  - Minimum: 2 nodes × t3.small.search = ~$60-80/month
  - Plus VPC NAT Gateway: ~$32/month
  - **Total Additional**: ~$90-120/month

**Cost Increase**: ~18-24x for OpenSearch

## Decision Framework

### Questions to Ask:

1. **Do users need to search INSIDE document text?**
   - ✅ Yes → Need OpenSearch
   - ✅ No → DynamoDB is sufficient

2. **Do users need semantic/similarity search?**
   - ✅ Yes → Need OpenSearch
   - ✅ No → DynamoDB is sufficient

3. **Can users find documents by extracted entities/phrases?**
   - ✅ Yes → DynamoDB is sufficient
   - ❌ No → Need OpenSearch

4. **Is searching by metadata enough for 80-90% of use cases?**
   - ✅ Yes → Start with DynamoDB, add OpenSearch later
   - ❌ No → Need OpenSearch from the start

## Current Architecture Assessment

**Your Current Setup**:
- ✅ Extracts entities (people, places, orgs)
- ✅ Extracts key phrases
- ✅ Generates summary and insights
- ✅ Stores structured data
- ✅ Stores first 10k chars of text
- ✅ Full document text available in S3 (if needed)

**What You Can Do Today**:
- Find documents by person name → Search entities
- Find documents by location → Search entities
- Find documents by key phrase → Search key phrases
- Find documents by language → Query GSI
- Get document summary/insights → Read metadata
- Access full document → Download from S3

**What You Cannot Do Today**:
- Search for exact phrase in document text beyond first 10k chars
- Semantic similarity search
- Fuzzy text matching

## Final Recommendation

**For Your Use Case**: **You probably DON'T need OpenSearch** ✅

**Why**:
1. ✅ You extract all important information (entities, phrases, summary)
2. ✅ Users can search by extracted metadata
3. ✅ Full documents are available in S3 if needed
4. ✅ Bedrock generates intelligent summaries (users can read those instead of full text)
5. ✅ Much simpler and cheaper without OpenSearch

**Add OpenSearch ONLY if**:
- Users explicitly request "search inside document text"
- Users need semantic/similarity search
- Metadata search is insufficient for their workflows

**Bottom Line**: Start simple. Add OpenSearch only when you have a clear business need that DynamoDB cannot meet.

