#!/usr/bin/env python3
"""
Template for execution scripts.

This script demonstrates the standard structure for deterministic execution scripts
in the 3-layer architecture system.
"""

import os
import sys
import logging
from typing import Any, Dict, Optional
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class ScriptNameError(Exception):
    """Custom exception for script-specific errors."""
    pass


def validate_inputs(param1: str, param2: Optional[str] = None) -> bool:
    """
    Validate input parameters before processing.
    
    Args:
        param1: Description of first parameter
        param2: Description of optional second parameter
        
    Returns:
        bool: True if inputs are valid
        
    Raises:
        ValueError: If inputs are invalid
    """
    if not param1:
        raise ValueError("param1 cannot be empty")
    
    # Add your validation logic here
    logger.info("Input validation passed")
    return True


def process_task(param1: str, param2: Optional[str] = None) -> Dict[str, Any]:
    """
    Main processing function - the core logic of the script.
    
    Args:
        param1: Description of first parameter
        param2: Description of optional second parameter
        
    Returns:
        Dict containing the results with keys:
            - status: "success" or "error"
            - data: The processed data (if successful)
            - message: Description of result or error
            
    Raises:
        ScriptNameError: If processing fails
    """
    try:
        logger.info(f"Starting processing with param1={param1}, param2={param2}")
        
        # Add your core logic here
        result_data = {
            "param1": param1,
            "param2": param2,
            # Add your processed data
        }
        
        logger.info("Processing completed successfully")
        return {
            "status": "success",
            "data": result_data,
            "message": "Task completed successfully"
        }
        
    except Exception as e:
        logger.error(f"Error during processing: {str(e)}", exc_info=True)
        return {
            "status": "error",
            "data": None,
            "message": str(e)
        }


def main() -> int:
    """
    Main entry point for the script.
    
    Returns:
        int: Exit code (0 for success, 1 for error)
    """
    try:
        # Example: Get required environment variables
        # api_key = os.getenv("API_KEY")
        # if not api_key:
        #     logger.error("API_KEY not found in environment variables")
        #     return 1
        
        # Example: Parse command-line arguments
        if len(sys.argv) < 2:
            logger.error("Usage: python template.py <param1> [param2]")
            return 1
        
        param1 = sys.argv[1]
        param2 = sys.argv[2] if len(sys.argv) > 2 else None
        
        # Validate inputs
        validate_inputs(param1, param2)
        
        # Process the task
        result = process_task(param1, param2)
        
        # Output results (can be JSON, write to file, database, etc.)
        if result["status"] == "success":
            logger.info(f"Success: {result['message']}")
            print(result["data"])  # Or use json.dumps(result) for JSON output
            return 0
        else:
            logger.error(f"Error: {result['message']}")
            return 1
            
    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}", exc_info=True)
        return 1


if __name__ == "__main__":
    sys.exit(main())
