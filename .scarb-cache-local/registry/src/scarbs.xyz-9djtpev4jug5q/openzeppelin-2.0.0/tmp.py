# benchmark_sizes.py
import os
import subprocess
import json

BUILD_DIR = "target/dev"
OUTPUT_FILE = "file_sizes.json"

def get_file_size(file_path):
    return os.path.getsize(file_path)

def benchmark():
    subprocess.run(["scarb", "build", "-p", "openzeppelin_test_common"], check=True)
    
    results = {}
    for file in os.listdir(BUILD_DIR):
        if file.endswith(".json"):
            path = os.path.join(BUILD_DIR, file)
            results[file] = {
                "size_bytes": get_file_size(path)
            }
    with open(OUTPUT_FILE, "w") as f:
        json.dump(results, f, indent=2)
    print(f"Benchmark complete. Output saved to {OUTPUT_FILE}")

if __name__ == "__main__":
    benchmark()