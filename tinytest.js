// inspired by https://github.com/joewalnes/jstinytest
// promisified for this project

const red =  '#ff9999';

let testName

function log(msg) {
  document.getElementById('log').innerHTML += `<div>${msg}</div>`
}

function logError(msg) {
  document.getElementById('log').innerHTML += `<div style="background-color:${red}">${msg}</div>`
}  

const TinyTest = {

  run: async function(tests) {

    const testNames = Object.keys(tests)

    for (i = 0; i < testNames.length; i++) {
      const testName = testNames[i]
      log(testName)
      await tests[testName]()
    }

    log('done')

 },

  assert: function(value) {
    if (!value) {
      let msg = `${testName}: ${value}`
      console.error(msg)
      logError(msg)
    }
  },

  assertEquals: function(expected, actual) {
    if (expected != actual) {
      let msg = `${testName}: expected ${expected}, actual ${actual}`
      console.error(msg)
      logError(msg)
    }
  },
  
};

const assert              = TinyTest.assert,
      assertEquals        = TinyTest.assertEquals,
      eq                  = TinyTest.assertEquals, // alias for assertEquals
      tests               = TinyTest.run;