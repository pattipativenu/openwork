import os
import subprocess
import sys

def parse_env_file(filepath):
    env_vars = {}
    if not os.path.exists(filepath):
        print(f"Error: {filepath} not found.")
        return env_vars

    with open(filepath, 'r') as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            
            # Handle comments at the end of the line
            if '#' in line:
               line = line.split('#', 1)[0].strip()

            if '=' in line:
                key, value = line.split('=', 1)
                key = key.strip()
                value = value.strip()
                
                # Remove quotes if present
                if (value.startswith('"') and value.endswith('"')) or \
                   (value.startswith("'") and value.endswith("'")):
                    value = value[1:-1]
                
                env_vars[key] = value
    return env_vars

def deploy_to_cloud_run():
    project_id = "briefme-hackathon"
    region = "us-central1"
    service_name = "openwork"
    env_file = ".env.local"
    temp_env_yaml = "env_vars_temp.yaml"

    print(f"Reading environment variables from {env_file}...")
    env_vars = parse_env_file(env_file)
    
    if not env_vars:
        print("No environment variables found or file is empty.")
        return

    # Write to a YAML file to avoid command-line parsing issues with commas
    import yaml
    print(f"Writing environment variables to {temp_env_yaml}...")
    with open(temp_env_yaml, 'w') as f:
        yaml.dump(env_vars, f, default_flow_style=False)

    print(f"Deploying service '{service_name}' to Cloud Run in region '{region}'...")
    
    cmd = [
        "gcloud", "run", "deploy", service_name,
        "--source", ".",
        "--project", project_id,
        "--region", region,
        "--allow-unauthenticated",
        "--env-vars-file", temp_env_yaml
    ]

    try:
        # Stream output to console
        process = subprocess.Popen(
            cmd, 
            stdout=subprocess.PIPE, 
            stderr=subprocess.STDOUT,
            text=True
        )
        
        for line in process.stdout:
            print(line, end='')
        
        process.wait()
        
        # Clean up temporary file
        if os.path.exists(temp_env_yaml):
            os.remove(temp_env_yaml)

        if process.returncode == 0:
            print("\nDeployment successful!")
        else:
            print("\nDeployment failed.")
            sys.exit(process.returncode)

    except Exception as e:
        print(f"An error occurred: {e}")
        # Clean up on error too
        if os.path.exists(temp_env_yaml):
            os.remove(temp_env_yaml)
        sys.exit(1)

if __name__ == "__main__":
    deploy_to_cloud_run()
