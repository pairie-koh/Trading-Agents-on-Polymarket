#!/bin/bash
# Oracle Lab Droplet Setup — run as root
echo "=== Installing dependencies ==="
apt update && apt install -y python3-venv python3-pip git tmux jq
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

echo "=== Cloning oracle-lab ==="
cd /root
git clone https://github.com/andybhall/oracle-lab.git
cd oracle-lab

echo "=== Setting up Python ==="
python3 -m venv venv
source venv/bin/activate
pip install requests numpy pandas scikit-learn

echo "=== Cloning dashboard ==="
git clone https://github.com/pairie-koh/Trading-Agents-on-Polymarket.git /root/oracle-lab-dashboard

echo "=== Setting git identity ==="
cd /root/oracle-lab
git config user.name "Oracle Lab Bot"
git config user.email "hello.pairie@gmail.com"

echo ""
echo "========================================="
echo "  DONE! Now you need to set API keys."
echo "  Run these two commands next:"
echo ""
echo '  nano /root/oracle-lab/.env'
echo ""
echo "  Then type these lines in the file:"
echo '  export OPENROUTER_API_KEY="your-key-here"'
echo '  export PERPLEXITY_API_KEY="your-key-here"'
echo "========================================="
