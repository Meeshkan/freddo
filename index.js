'use strict'

/**
 * Module dependencies.
 */

const assert = require('assert').strict
const got = require('got')
const JSPath = require('jspath')

/**
 * Initializes `Test`.
 *
 * @method freddo
 * @api public
 */

function Test(url, options) {
	this.data = {
		url,
		options,
		response: {},
		error: null
	}
	this.promise = Promise.resolve(null)
	this.request()
}

const freddo = (url, options = null) => new Test(url, options)

Test.prototype.extend = function (promise, that) {
	for (const key in that) {
		promise[key] = that[key]
	}
}

Test.prototype.next = function (what) {
	this.promise = this.promise.then(what)
	this.extend(this.promise, this)
	return this.promise
}

Test.prototype.request = function () {
	return this.next(async () => {
		let response
		if (this.data.options === undefined) {
			response = await got(this.data.url)
		} else {
			response = await got(this.data.url, this.data.options)
		}

		this.data.response = response
		return true
	})
}

Test.prototype.verify = async function (key, expected, isHeader) {
	let check = expected
	let value
	let location
	if (key instanceof Expression) {
		if (typeof this.data.response.body !== 'string') {
			this.data.response.body = JSON.stringify(this.data.response.body)
		}

		value = key.apply(JSON.parse(this.data.response.body))
		location = `expression ${JSON.stringify(key.expression)}`
	} else {
		if (isHeader) {
			value = this.data.response.headers[key]
		} else {
			value = this.data.response[key]
		}

		if (typeof value === 'undefined') {
			throw new TypeError(`Key ${JSON.stringify(key)} does not exist`)
		}

		location = `key ${JSON.stringify(key)}`
	}

	if (typeof expected !== 'function') {
		check = (actual, location) => {
			try {
				assert.deepStrictEqual(actual, expected)
			} catch (_) {
				return {
					result: false,
					error: `Expected ${location} to be ${JSON.stringify(expected)}, but got ${JSON.stringify(actual)}`
				}
			}

			return true
		}
	}

	let result = check(value, location)
	let error = `Custom assertion failed: ${check}`
	if (typeof result !== 'boolean') {
		if (typeof result.result === 'undefined') {
			throw new TypeError('Custom assertion functions must return a boolean or a {result, error} object')
		}

		if (typeof result.error !== 'undefined') {
			error = result.error
		}

		result = result.result
	}

	if (!result) {
		this.data.error = error
	}

	return result
}

Test.prototype.expect = function (key, expected, isHeader = false) {
	return this.next(prev => prev && this.verify(key, expected, isHeader))
}

Test.prototype.status = function (expected) {
	return this.expect('statusCode', expected)
}

Test.prototype.header = function (key, expected) {
	return this.expect(key, String(expected), true)
}

Test.prototype.body = function (expected, expression = null) {
	if (expression === null) {
		return this.expect('body', expected)
	}

	return this.expect(expression, expected)
}

Test.prototype.redirectsTo = function (url) {
	return this.status(code => [301, 302, 303, 307, 308].includes(code))
		.header('location', url)
}

Test.prototype.ensure = async function () {
	if (!(await this)) {
		throw new Error(this.data.error)
	}
}

const exists = (actual, location) => {
	if (actual.length !== 0) {
		return true
	}

	return {
		result: false,
		error: `Expected ${location} to contain a value, but it does not exist`
	}
}

class Expression {
	constructor(expression) {
		this.expression = expression
	}

	apply(haystack) {
		return JSPath.apply(this.expression, haystack)
	}
}

const expr = expression => new Expression(expression)

/**
 * Expose `freddo`, `expr`, and `exists`.
 */

module.exports = {freddo, expr, exists}
