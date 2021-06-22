# start clean
rm ./hlib2.bundle.*

# transpile hlib.ts to hlib.js
tsc

# bundle hlib.js as hlib.bundle.js
./node_modules/.bin/webpack