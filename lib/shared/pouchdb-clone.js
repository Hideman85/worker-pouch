'use strict';

function isBinaryObject (object) {
  return object instanceof ArrayBuffer
    || (typeof Blob !== 'undefined' && object instanceof Blob)
}

function cloneArrayBuffer (buff) {
  if (typeof buff.slice === 'function') {
    return buff.slice(0)
  }
  // IE10-11 slice() polyfill
  const target = new ArrayBuffer(buff.byteLength)
  const targetArray = new Uint8Array(target)
  const sourceArray = new Uint8Array(buff)
  targetArray.set(sourceArray)
  return target
}

function cloneBinaryObject (object) {
  if (object instanceof ArrayBuffer) {
    return cloneArrayBuffer(object)
  }
  // Blob
  return object.slice(0, object.size, object.type)
}

module.exports = function clone (object) {
  let newObject
  let i
  let len

  if (!object || typeof object !== 'object') {
    return object
  }

  if (Array.isArray(object)) {
    newObject = []
    for (i = 0, len = object.length; i < len; i++) {
      newObject[i] = clone(object[i])
    }
    return newObject
  }

  // special case: to avoid inconsistencies between IndexedDB
  // and other backends, we automatically stringify Dates
  if (object instanceof Date) {
    return object.toISOString()
  }

  if (isBinaryObject(object)) {
    return cloneBinaryObject(object)
  }

  newObject = {}
  for (i in object) {
    if (Object.prototype.hasOwnProperty.call(object, i)) {
      const value = clone(object[i])
      if (typeof value !== 'undefined') {
        newObject[i] = value
      }
    }
  }
  return newObject
}
