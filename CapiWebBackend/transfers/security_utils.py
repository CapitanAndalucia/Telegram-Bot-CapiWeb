"""
Security utilities for file validation and malware scanning
"""
import os
import json
import zipfile
import rarfile
import tarfile
from pathlib import Path
from django.conf import settings
import hashlib
import vt

# Load security configuration
CONFIG_PATH = Path(__file__).resolve().parent.parent.parent / 'security_config.json'

def load_security_config():
    """Load security configuration from JSON file"""
    with open(CONFIG_PATH, 'r') as f:
        return json.load(f)

SECURITY_CONFIG = load_security_config()

def get_all_allowed_extensions():
    """Get flat list of all allowed extensions"""
    extensions = []
    for category in SECURITY_CONFIG['file_validation']['allowed_extensions'].values():
        extensions.extend(category)
    return set(extensions)

def get_blocked_extensions():
    """Get list of blocked extensions"""
    return set(SECURITY_CONFIG['file_validation']['blocked_extensions'])

def get_dangerous_extensions():
    """Get list of dangerous extensions in archives"""
    return set(SECURITY_CONFIG['file_validation']['dangerous_in_archives'])

def scan_archive_contents(file_path):
    """
    Scan archive (ZIP, RAR, TAR) for dangerous file types
    Returns: (has_executables: bool, executable_list: list)
    """
    if not SECURITY_CONFIG['archive_scanning']['enabled']:
        return False, []
    
    dangerous_exts = get_dangerous_extensions()
    found_executables = []
    ext = os.path.splitext(file_path)[1].lower()
    
    try:
        max_files = SECURITY_CONFIG['archive_scanning']['max_files_to_scan']
        
        if ext == '.zip':
            with zipfile.ZipFile(file_path, 'r') as zf:
                for i, name in enumerate(zf.namelist()):
                    if i >= max_files:
                        break
                    file_ext = os.path.splitext(name)[1].lower()
                    if file_ext in dangerous_exts:
                        found_executables.append(name)
        
        elif ext == '.rar':
            with rarfile.RarFile(file_path, 'r') as rf:
                for i, name in enumerate(rf.namelist()):
                    if i >= max_files:
                        break
                    file_ext = os.path.splitext(name)[1].lower()
                    if file_ext in dangerous_exts:
                        found_executables.append(name)
        
        elif ext in ['.tar', '.gz', '.bz2']:
            mode = 'r:gz' if ext == '.gz' else 'r:bz2' if ext == '.bz2' else 'r'
            with tarfile.open(file_path, mode) as tf:
                for i, member in enumerate(tf.getmembers()):
                    if i >= max_files:
                        break
                    file_ext = os.path.splitext(member.name)[1].lower()
                    if file_ext in dangerous_exts:
                        found_executables.append(member.name)
        
        return len(found_executables) > 0, found_executables
    
    except Exception as e:
        print(f"Error scanning archive: {e}")
        return False, []

def scan_with_virustotal(file_path):
    """
    Scan file with VirusTotal API
    """
    if not SECURITY_CONFIG['malware_scanning']['virustotal']['enabled']:
        return True, None
    
    api_key = getattr(settings, 'VIRUSTOTAL_API_KEY', None)
    if not api_key:
        return True, None
    
    try:
        # Check file size limit for VirusTotal
        file_size_mb = os.path.getsize(file_path) / (1024 * 1024)
        max_size_mb = SECURITY_CONFIG['malware_scanning']['virustotal']['max_file_size_mb']
        
        if file_size_mb > max_size_mb:
            print(f"File too large for VirusTotal ({file_size_mb:.2f} MB > {max_size_mb} MB)")
            return True, None
        
        client = vt.Client(api_key)
        
        # Calculate file hash
        with open(file_path, 'rb') as f:
            file_hash = hashlib.sha256(f.read()).hexdigest()
        
        # Check if file was already scanned
        try:
            file_report = client.get_object(f"/files/{file_hash}")
            stats = file_report.last_analysis_stats
            
            # If any engine detected malware, reject
            if stats.get('malicious', 0) > 0:
                client.close()
                return False, f"Malware detected by {stats.get('malicious', 0)} engines"
                
        except vt.APIError:
            # File not in VirusTotal database, upload for scanning
            with open(file_path, 'rb') as f:
                analysis = client.scan_file(f)
        
        client.close()
        return True, None
        
    except Exception as e:
        print(f"VirusTotal scan error: {e}")
        return True, None

def scan_with_clamav(file_path):
    """
    Scan file with ClamAV
    """
    if not SECURITY_CONFIG['malware_scanning']['clamav']['enabled']:
        return True, None
    
    try:
        import pyclamd
        
        # Try to connect to ClamAV daemon
        socket_path = SECURITY_CONFIG['malware_scanning']['clamav']['socket_path']
        
        # Try Unix socket first
        try:
            cd = pyclamd.ClamdUnixSocket(socket_path)
        except:
            # Fallback to network socket
            cd = pyclamd.ClamdNetworkSocket()
        
        # Ping to check if ClamAV is running
        if not cd.ping():
            print("ClamAV daemon not running")
            return True, None
        
        # Scan file
        scan_result = cd.scan_file(file_path)
        
        if scan_result:
            # scan_result is a dict: {filename: ('FOUND', 'virus_name')}
            for filename, (status, virus_name) in scan_result.items():
                if status == 'FOUND':
                    return False, f"Malware detected: {virus_name}"
        
        return True, None
        
    except ImportError:
        print("pyclamd not installed, skipping ClamAV scan")
        return True, None
    except Exception as e:
        print(f"ClamAV scan error: {e}")
        return True, None

def scan_file_for_malware(file_path):
    """
    Scan file for malware using configured scanner
    Returns: (is_safe: bool, message: str or None)
    """
    if not SECURITY_CONFIG['malware_scanning']['enabled']:
        return True, None
    
    scanner = SECURITY_CONFIG['malware_scanning']['scanner']
    
    if scanner == 'virustotal':
        return scan_with_virustotal(file_path)
    elif scanner == 'clamav':
        return scan_with_clamav(file_path)
    else:
        print(f"Unknown scanner: {scanner}")
        return True, None
