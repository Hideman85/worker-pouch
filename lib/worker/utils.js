'use strict';

const safeEval = require('./safe-eval')

// mostly borrowed from express-pouchb's utils.sendError()
exports.createError = function (err) {
  const status = err.status || 500

  // last argument is optional
  if (err.name && err.message) {
    if (err.name === 'Error' || err.name === 'TypeError') {
      if (err.message.indexOf('Bad special document member') !== -1) {
        err.name = 'doc_validation'
        // add more clauses here if the error name is too general
      } else {
        err.name = 'bad_request'
      }
    }
    err = {
      error: err.name,
      name: err.name,
      reason: err.message,
      message: err.message,
      status
    }
  }
  return err
}

exports.decodeArgs = function decodeArgs (args) {
  const funcArgs = ['filter', 'map', 'reduce']
  args.forEach(arg => {
    if (typeof arg === 'object' && arg !== null && !Array.isArray(arg)) {
      funcArgs.forEach(funcArg => {
        if (!(funcArg in arg) || arg[funcArg] === null) {
          delete arg[funcArg]
        } else if (arg[funcArg].type === 'func' && arg[funcArg].func) {
          arg[funcArg] = safeEval(arg[funcArg].func)
        }
      })
    }
  })
  return args
}
