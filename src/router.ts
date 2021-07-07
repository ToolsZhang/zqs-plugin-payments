import { Zqs } from 'zqs-core'
import { IDocs } from 'zqs-core/lib/docs'
import { Router } from 'zqs-core/lib/routers'
import { IConfig } from './config'
import { Controller } from './controller'
import { createModel as createChargeModel } from './charge'
import { createModel as createRefundModel, refund } from './refund'
import { addWebhook } from './webhook'

export async function setupRouter(app: Zqs): Promise<Router[]> {
    const config: IConfig = app.config.payments
    const routers: Router[] = []

    for (const payment of config.payments) {
        const chargeModel = createChargeModel(payment)
        let refundModel
        if (payment.refund) refundModel = createRefundModel(payment)
        const controller = new Controller(chargeModel, payment)
        const prefix = '__payments_' + payment.path
        const chargePrefix = prefix + '_charge'
        const refundPrefix = prefix + '_refund'
        const webhookPrefix = prefix + '_webhook'
        const paths: IDocs[] = [
            {
                path: '/charge',
                methods: ['get'],
                controller: controller.index,
                auth: {
                    type: 'hasRoles',
                    roles: config.roles,
                },
                tags: [chargePrefix],
                summary: 'List documents',
                description: 'List documents',
                consumes: ['application/json', 'application/xml'],
                produces: ['application/json', 'application/xml'],
                parameters: [chargeModel.docSchema.paginateOptions],
                responses: {
                    200: {
                        description: 'Successful operation',
                        schema: chargeModel.docSchema.paginateResult,
                    },
                    '4xx': chargeModel.docSchema.response4xx,
                    '5xx': chargeModel.docSchema.response5xx,
                },
            },
            {
                path: '/charge',
                methods: ['post'],
                controller: controller.create,
                auth: {
                    type: 'isAuthenticated',
                },
                tags: [chargePrefix],
                summary: 'create a charge',
                description: 'create a charge',
                consumes: ['application/json', 'application/xml'],
                produces: ['application/json', 'application/xml'],
                parameters: [
                    {
                        name: 'body',
                        in: 'body',
                        schema: {
                            type: 'object',
                            properties: payment.parameters,
                            xml: { name: 'xml' },
                            required: true,
                        },
                    },
                ],
                responses: {
                    200: {
                        description: 'Successful operation',
                    },
                    '4xx': chargeModel.docSchema.response4xx,
                    '5xx': chargeModel.docSchema.response5xx,
                },
            },
        ]

        if (payment.refund) {
            paths.push({
                path: '/refund/:id',
                methods: ['post'],
                controller: controller.refund,
                auth: {
                    type: 'hasRoles',
                    roles: config.roles,
                },
                tags: [refundPrefix],
                summary: 'create a refund',
                description: 'create a refund',
                consumes: ['application/json', 'application/xml'],
                produces: ['application/json', 'application/xml'],
                parameters: [
                    refundModel.docSchema.paramId,
                    {
                        name: 'body',
                        in: 'body',
                        schema: {
                            type: 'object',
                            properties: {
                                reason: {
                                    type: 'string',
                                },
                            },
                            xml: { name: 'xml' },
                            required: true,
                        },
                    },
                ],
                responses: {
                    200: {
                        description: 'Successful operation',
                    },
                    '4xx': refundModel.docSchema.response4xx,
                    '5xx': refundModel.docSchema.response5xx,
                },
            })
        }

        if (payment.https) {
            let url = `https://${app.config.domain}`
            if (app.config.spdy.port !== 443) {
                url += `:${app.config.spdy.port}`
            }
            addWebhook(payment.path, `${url}/${prefix}/webhook`)
        } else {
            let url = `http://${app.config.domain}`
            if (app.config.port !== 80) {
                url += `:${app.config.port}`
            }
            addWebhook(payment.path, `${url}/${prefix}/webhook`)
        }
        for (const chanel of payment.channels) {
            if (payment.test) {
                paths.push({
                    path: '/webhook/pay/' + chanel + '/test/:id',
                    methods: ['post'],
                    controller: controller.testChargeWebhook,
                    tags: [webhookPrefix],
                    summary: 'webhook for payments',
                    description: 'webhook for payments',
                    consumes: ['application/json', 'application/xml'],
                    produces: ['application/json', 'application/xml'],
                    parameters: [chargeModel.docSchema.paramId],
                    responses: {
                        200: {
                            description: 'Successful operation',
                        },
                        '4xx': chargeModel.docSchema.response4xx,
                        '5xx': chargeModel.docSchema.response5xx,
                    },
                })
            } else {
                paths.push({
                    path: '/webhook/pay/' + chanel,
                    methods: ['post'],
                    controller: controller.createChargeWebhook(chanel),
                    tags: [webhookPrefix],
                    summary: 'webhook for payments',
                    description: 'webhook for payments',
                    consumes: ['application/json', 'application/xml'],
                    produces: ['application/json', 'application/xml'],
                    parameters: [],
                    responses: {
                        200: {
                            description: 'Successful operation',
                        },
                        '4xx': chargeModel.docSchema.response4xx,
                        '5xx': chargeModel.docSchema.response5xx,
                    },
                })
            }
        }

        routers.push(chargeModel.routes('/' + prefix, ...paths))
    }

    return routers
}
