import { createHash } from 'crypto'
import * as xml2js from 'xml2js'
const nhm = require('nhm')

export function sign(object: any, key: string) {
    let querystring = createQueryString(object)
    querystring += '&key=' + key
    return createHash('md5')
        .update(querystring)
        .digest('hex')
        .toUpperCase()
}

export function createNonceStr(length?: number): string {
    length = length || 24
    if (length > 32) length = 32
    return new nhm(length, {
        lowerCase: true,
        upperCase: false,
        number: true,
        symbol: false,
    }).toString()
}

export function createQueryString(options: { [x: string]: string }) {
    return Object.keys(options)
        .filter(key => {
            return (
                options[key] !== undefined && options[key] !== '' && ['pfx', 'apiKey', 'sign', 'key'].indexOf(key) < 0
            )
        })
        .sort()
        .map(key => {
            return key + '=' + options[key]
        })
        .join('&')
}

export function buildXML(json: { xml: any }) {
    const builder = new xml2js.Builder()
    return builder.buildObject(json)
}

export function parseXML(xml: xml2js.convertableToString): Promise<any> {
    return new Promise((resolve, reject) => {
        const parser = new xml2js.Parser({
            trim: true,
            explicitArray: false,
            explicitRoot: false,
        })
        parser.parseString(xml, (err: any, result: any) => {
            if (err) {
                reject(err)
            } else {
                resolve(result)
            }
        })
    })
}
