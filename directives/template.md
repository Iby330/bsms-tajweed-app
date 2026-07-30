# [Task Name]

## Goal
Describe what needs to be accomplished. Be specific about the desired outcome.

## Inputs
List all required inputs and their formats:
- **Input 1**: Description (e.g., URL, file path, API key name)
- **Input 2**: Description
- **Optional Input**: Description (if not provided, use default: X)

## Tools/Scripts to Use
Specify which execution scripts should be called:
1. `execution/script_name.py` - Brief description of what it does
2. `execution/another_script.py` - Brief description

## Expected Outputs
Define what the result should look like:
- **Output format**: JSON, CSV, database entry, etc.
- **Output location**: File path, database table, API endpoint
- **Success criteria**: How to verify the task completed successfully

## Process Flow
Step-by-step instructions:
1. Validate inputs (check X is valid, Y is accessible)
2. Call `execution/script_name.py` with parameters A, B, C
3. Process the result
4. Handle success/failure cases
5. Return output in specified format

## Edge Cases & Known Issues
Document common problems and solutions:
- **API Rate Limits**: If you hit rate limit, wait X seconds and retry up to Y times
- **Missing Data**: If input file is empty, return error message Z
- **Timeouts**: If request takes longer than X seconds, cancel and log error
- **Error Handling**: How to handle specific error codes or exceptions

## Examples
Provide concrete examples:

### Example 1: Success Case
```
Input: URL = "https://example.com"
Expected Output: {"status": "success", "data": [...]}
```

### Example 2: Error Case
```
Input: Invalid URL
Expected Output: {"status": "error", "message": "Invalid URL format"}
```

## Notes & Learnings
Update this section as you discover new information:
- Date: Learning or improvement discovered
- Date: API constraint or timing consideration
