# start clean
rm ./hlib*.bundle.*

# transpile hlib.ts to hlib.js
tsc

# bundle hlib.js as hlib.bundle.js
./node_modules/.bin/webpack