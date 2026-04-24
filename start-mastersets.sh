#!/bin/bash

# PokéBinder Agent Session Launcher
/Users/big_hams/Library/Mobile\ Documents/com\~apple\~CloudDocs/Pokemon/PokeBinder=~/pokebinder  # Update this to your actual project path

tmux new-session -d -s pokebinder -n marcus
tmux send-keys -t pokebinder:marcus "cd $/Users/big_hams/Library/Mobile\ Documents/com\~apple\~CloudDocs/Pokemon/PokeBinder && claude" Enter

tmux new-window -t pokebinder -n riley
tmux send-keys -t pokebinder:riley "cd $/Users/big_hams/Library/Mobile\ Documents/com\~apple\~CloudDocs/Pokemon/PokeBinder && claude" Enter

tmux new-window -t pokebinder -n morgan
tmux send-keys -t pokebinder:morgan "cd $/Users/big_hams/Library/Mobile\ Documents/com\~apple\~CloudDocs/Pokemon/PokeBinder && claude" Enter

tmux new-window -t pokebinder -n sam-casey
tmux send-keys -t pokebinder:sam-casey "cd $/Users/big_hams/Library/Mobile\ Documents/com\~apple\~CloudDocs/Pokemon/PokeBinder && claude" Enter

tmux new-window -t pokebinder -n ash
tmux send-keys -t pokebinder:ash "cd $/Users/big_hams/Library/Mobile\ Documents/com\~apple\~CloudDocs/Pokemon/PokeBinder && claude" Enter

tmux new-window -t pokebinder -n dante
tmux send-keys -t pokebinder:dante "cd $/Users/big_hams/Library/Mobile\ Documents/com\~apple\~CloudDocs/Pokemon/PokeBinder && claude" Enter

# Attach to the session, starting on marcus
tmux attach-session -t pokebinder:marcus