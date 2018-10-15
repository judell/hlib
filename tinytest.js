// inspired by https://github.com/joewalnes/jstinytest
// promisified for this project

const green = '#99ff99';

const red =  '#ff9999';

let testName

function log(msg) {
  document.getElementById('log').innerHTML += `<div>${msg}</div>`
}

function logError(msg) {
  document.getElementById('log').innerHTML += `<div style="background-color:${red}">${msg}</div>`
}  

const TinyTest = {

  run: function(tests) {

    log(testName = 'gets token')
    tests[testName]()
    .then( () => {
    log(testName = 'gets "" when no user')
    tests[testName]()
    .then ( () => {
    log(testName = 'username input form saves and retrieves value')
    tests[testName]()
    .then ( () => {
    log(testName = 'creates facet input form')
    tests[testName]()
    .then ( () => {
    log(testName = 'creates default group picklist with > 1 groups when token')
    tests[testName]()
    .then ( () => {
    log(testName = 'creates custom group picklist with > 1 groups when token')
    tests[testName]()
    .then ( () => {
    log(testName = 'creates group picklist with 1 group when no token')
    tests[testName]()
    .then ( () => {
    log(testName = 'creates a pagenote')
    tests[testName]()
    .then ( () => {
    log(testName = 'creates an annotation')
    tests[testName]()
    .then ( () => {
    log(testName = 'finds a test annotation')
    tests[testName]()
    .then ( () => {
    log(testName = 'retrieves 600 annotations')
    tests[testName]()
    .then( () => {
    log(testName = 'uses wildcard uris')
    tests[testName]()
    }) }) }) }) }) }) }) }) }) }) })

  setTimeout(function() { // Give document a chance to complete
    if (window.document && document.body) {
      document.body.style.backgroundColor = green
    }
  }, 0)

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