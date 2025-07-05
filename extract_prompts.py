#!/usr/bin/env python3
"""
Utility to extract "prompt" elements from JSON files in subdirectories.
Outputs all prompts to a text file with quotes and comma separation.
"""

import json
import os
import sys
from pathlib import Path

def extract_prompts_from_json_files(root_directory, output_file):
    """
    Recursively find all JSON files and extract their "prompt" elements.
    
    Args:
        root_directory (str): Starting directory to search
        output_file (str): Path to output text file
    """
    prompts = []
    json_files_found = 0
    prompts_extracted = 0
    
    # Walk through all subdirectories
    for root, dirs, files in os.walk(root_directory):
        for file in files:
            if file.lower().endswith('.json'):
                json_files_found += 1
                file_path = os.path.join(root, file)
                
                try:
                    with open(file_path, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                        
                    # Extract prompt if it exists
                    if isinstance(data, dict) and 'prompt' in data:
                        prompt = data['prompt']
                        if prompt:  # Only add non-empty prompts
                            prompts.append(prompt)
                            prompts_extracted += 1
                    elif isinstance(data, list):
                        # Handle case where JSON is an array of objects
                        for item in data:
                            if isinstance(item, dict) and 'prompt' in item:
                                prompt = item['prompt']
                                if prompt:
                                    prompts.append(prompt)
                                    prompts_extracted += 1
                                    
                except (json.JSONDecodeError, UnicodeDecodeError) as e:
                    print(f"Error reading {file_path}: {e}")
                except Exception as e:
                    print(f"Unexpected error with {file_path}: {e}")

    # Remove duplicates (preserve order)
    seen = set()
    unique_prompts = []
    for prompt in prompts:
        if prompt not in seen:
            unique_prompts.append(prompt)
            seen.add(prompt)

    # Write prompts to output file
    try:
        with open(output_file, 'w', encoding='utf-8') as f:
            # Join prompts with quotes, comma, and carriage return
            for i, prompt in enumerate(unique_prompts):
                if i < len(unique_prompts) - 1:
                    f.write(f'"{prompt}",\r\n')
                else:
                    f.write(f'"{prompt}"')
        
        print(f"Successfully processed {json_files_found} JSON files")
        print(f"Extracted {len(unique_prompts)} unique prompts (from {prompts_extracted} total prompts)")
        print(f"Output written to: {output_file}")
        
    except Exception as e:
        print(f"Error writing to {output_file}: {e}")
        return False
    
    return True

def main():
    if len(sys.argv) != 3:
        print("Usage: python extract_prompts.py <root_directory> <output_file>")
        print("Example: python extract_prompts.py ./data ./prompts.txt")
        sys.exit(1)
    
    root_dir = sys.argv[1]
    output_file = sys.argv[2]
    
    if not os.path.exists(root_dir):
        print(f"Error: Directory '{root_dir}' does not exist")
        sys.exit(1)
    
    print(f"Searching for JSON files in: {root_dir}")
    print(f"Output will be written to: {output_file}")
    print("-" * 50)
    
    success = extract_prompts_from_json_files(root_dir, output_file)
    
    if success:
        print("\n✅ Extraction completed successfully!")
    else:
        print("\n❌ Extraction failed!")
        sys.exit(1)

if __name__ == "__main__":
    main() 