# Execution Scripts

This directory contains deterministic Python scripts that implement the actual work.

## Purpose
- Handle API calls, data processing, file operations, database interactions
- Reliable, testable, fast
- Separate execution from decision-making

## Guidelines
- Scripts should be deterministic and consistent
- Use environment variables from `.env` for configuration
- Include proper error handling and logging
- Make scripts reusable and modular
- Add docstrings and type hints

## Environment Setup
Scripts in this directory use `.env` for configuration. Make sure to:
1. Copy `.env.example` to `.env` (if it exists)
2. Add required API keys and tokens
3. Never commit `.env` to version control

## Example Scripts
- `scrape_single_site.py` - Web scraping implementation
- `process_batch.py` - Batch data processing
- `api_client.py` - Reusable API client wrapper
