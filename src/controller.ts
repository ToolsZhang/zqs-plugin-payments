import { IContext } from 'zqs-core/lib/context'
import { IModel, paginate } from 'zqs-core/lib/db'
import { Boom, handleError } from 'zqs-core/lib/errors'
import { response } from 'zqs-core/lib/response'
import { IPayment, EChannel, charge } from './charge'
import { refund } from './refund'
import { Wechatpay } from './wechatpay'

export class Controller {
    constructor(private model: IModel, private payment: IPayment) {}
    // Gets a list of Models
    public index = async (ctx: IContext) => {
        try {
            const paginateResult = await paginate(this.model, ctx)
            response(ctx, 200, paginateResult)
        } catch (e) {
            console.error(e)
            handleError(ctx, e)
        }
    }

    // Creates a new Model in the DB
    public create = async (ctx: IContext) => {
        try {
            const doc: any = await this.payment.charge(ctx)
            delete doc.paid
            delete doc.createdAt
            delete doc.updatedAt
            const res = await charge(this.payment, doc)

            response(ctx, 201, res)
        } catch (e) {
            handleError(ctx, e)
        }
    }

    // Creates a refund
    public refund = async (ctx: IContext) => {
        try {
            const res = await refund(this.payment, ctx.params.id, ctx.request.fields.reason)
            response(ctx, 201, res)
        } catch (e) {
            handleError(ctx, e)
        }
    }

    public testChargeWebhook = async (ctx: IContext) => {
        try {
            const entity: any = await this.model.findById(ctx.params.id).exec()
            if (!entity) throw Boom.notFound()
            entity.paid = true
            await entity.save()
            await this.payment.chargeWebhook(entity)
            response(ctx, 200, {
                isYcsTest: true,
                success: true,
            })
        } catch (e) {
            handleError(ctx, e)
        }
    }

    public createChargeWebhook = (channel: EChannel) => {
        switch (channel) {
            case EChannel.alipay:
                return this.chargeWebhookForAlipay
            case EChannel.wechatpay:
            case EChannel.mppay:
            case EChannel.nativepay:
            case EChannel.minigrampay:
                return this.chargeWebhookForWechatpay
            default:
                throw new Error('Unsupported payment channel')
        }
    }

    private chargeWebhookForAlipay = async (ctx: IContext) => {
        try {
            console.log(ctx.request.fields)
            const verified = this.payment.alipayClient.verify(ctx.request.fields)
            if (!verified) throw Boom.badData('failed to verify sign')
            if (ctx.request.fields.trade_status === 'TRADE_SUCCESS') {
                const entity: any = await this.model.findById(ctx.request.fields.out_trade_no).exec()
                entity.paid = true
                await entity.save()
                await this.payment.chargeWebhook(entity)
            }
            ctx.status = 200
            ctx.body = 'success'
        } catch (e) {
            handleError(ctx, e)
        }
    }

    private chargeWebhookForWechatpay = async (ctx: IContext) => {
        try {
            if (!ctx.request.fields.appid) throw Boom.badData('empty appid')
            let client: Wechatpay
            if (this.payment.wechatpayClient && this.payment.wechatpayClient.config.appid === ctx.request.fields.appid)
                client = this.payment.wechatpayClient
            else if (this.payment.mppayClient && this.payment.mppayClient.config.appid === ctx.request.fields.appid)
                client = this.payment.mppayClient
            else if (
                this.payment.nativepayClient &&
                this.payment.nativepayClient.config.appid === ctx.request.fields.appid
            )
                client = this.payment.nativepayClient
            else if (
                this.payment.minigrampayClient &&
                this.payment.minigrampayClient.config.appid === ctx.request.fields.appid
            )
                client = this.payment.minigrampayClient
            if (!client) throw Boom.badData('invalid appid')
            const verified = client.signVerify(ctx.request.fields)
            if (!verified) throw Boom.badData('failed to verify sign')
            if (ctx.request.fields.return_code === 'SUCCESS' && ctx.request.fields.result_code === 'SUCCESS') {
                const entity: any = await this.model.findById(ctx.request.fields.out_trade_no).exec()
                entity.paid = true
                await entity.save()
                await this.payment.chargeWebhook(entity)
            }
            ctx.status = 200
            ctx.body = client.success()
        } catch (e) {
            handleError(ctx, e)
        }
    }
}
