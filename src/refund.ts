import { IModel, Model, Schema } from 'zqs-core/lib/db'
import { IDocsDataTypeProperties } from 'zqs-core/lib/docs'
import { IContext } from 'zqs-core/lib/context'
import { IPayment, EChannel, getModel as getChargeModel } from './charge'
import { Boom } from 'zqs-core/lib/errors'
import { TradeRefundRequest } from './alipay'
import { Wechatpay } from './wechatpay'

/**
 * All models
 */
export const models: Array<{
    path: string
    model: IModel
}> = []

/**
 * Creating a model
 * @param payment {IPayment} IPayment
 */
export function createModel(payment: IPayment): IModel {
    const schema = new Schema(
        {
            charge: {
                type: Schema.Types.ObjectId,
                ref: '__payments_charge_' + payment.path,
            },
            amount: {
                type: Number,
                require: true,
            },
            reason: {
                type: String,
                require: true,
            },
            extra: {},
            success: {
                type: Boolean,
                require: true,
            },
        },
        {
            timestamps: {},
        }
    )
    const model = Model({
        name: '__payments_refund_' + payment.path,
        schema,
    })
    models.push({ path: payment.path, model: model })
    return model
}

/**
 * Get model by given path
 * @param path {string} path
 */
export function getModel(path: string): IModel {
    const model = models.find(x => x.path === path)
    if (model) return model.model
    return null
}

export interface IRefundDocument {
    charge: string
    amount: number
    reason: string
    success: boolean
    extra: {
        isYcsTest?: true
        [x: string]: any
    }
}

/**
 * Refund a charge
 * @param payment {IPayment} payment path
 * @param chargeId {string} charge id
 * @param reason {string} refund reason
 */
export async function refund(payment: IPayment, chargeId: string, reason: string): Promise<any> {
    if (!payment.refund) throw Boom.badData('Payment disabled')
    const chargeModel = getChargeModel(payment.path)
    const refundModel = getModel(payment.path)
    const charge: any = await chargeModel.findById(chargeId).exec()
    if (!charge) throw Boom.notFound('Charge not found')
    const refund = await createRefund(payment, charge, reason)
    const res = await refundModel.create(refund)
    await payment.refund(refund, charge)
    return res
}

async function createRefund(payment: IPayment, charge: any, reason: string): Promise<IRefundDocument> {
    if (payment.test) {
        return {
            charge: charge._id,
            amount: charge.amount,
            reason: reason,
            success: true,
            extra: { isYcsTest: true },
        }
    }
    switch (charge.channel) {
        case EChannel.alipay:
            return createRefundForAlipay(payment, charge, reason)
        case EChannel.wechatpay:
        case EChannel.mppay:
        case EChannel.nativepay:
        case EChannel.minigrampay:
            return createRefundForWechatpay(payment, charge, reason)
        default:
            throw Boom.badData('Unsupported refund method')
    }
}

async function createRefundForAlipay(payment: IPayment, charge: any, reason: string): Promise<IRefundDocument> {
    const req = new TradeRefundRequest()
    req.setBizContent({
        out_trade_no: charge._id,
        refund_amount: charge.amount.toString(),
        refund_reason: reason,
    })
    try {
        const refund = await payment.alipayClient.execute(req)
        const success = !!refund.alipay_trade_refund_response && refund.alipay_trade_refund_response.code === '10000'
        return {
            charge: charge._id,
            amount: charge.amount,
            reason: reason,
            success: success,
            extra: refund,
        }
    } catch (e) {
        return {
            charge: charge._id,
            amount: charge.amount,
            reason: reason,
            success: false,
            extra: e,
        }
    }
}

async function createRefundForWechatpay(payment: IPayment, charge: any, reason: string): Promise<IRefundDocument> {
    try {
        let client: Wechatpay
        switch (charge.channel) {
            case EChannel.wechatpay:
                client = payment.wechatpayClient
                break
            case EChannel.mppay:
                client = payment.mppayClient
                break
            case EChannel.nativepay:
                client = payment.nativepayClient
                break
            case EChannel.minigrampay:
                client = payment.minigrampayClient
                break
        }
        const refund = await client.refund({
            out_trade_no: charge._id.toString(),
            out_refund_no: charge._id.toString(),
            total_fee: Math.ceil(charge.amount * 100),
            refund_fee: Math.ceil(charge.amount * 100),
        })
        const success = refund.return_code === 'SUCCESS' && refund.result_code === 'SUCCESS'
        return {
            charge: charge._id,
            amount: charge.amount,
            reason: reason,
            success: success,
            extra: refund,
        }
    } catch (e) {
        return {
            charge: charge._id,
            amount: charge.amount,
            reason: reason,
            success: false,
            extra: e,
        }
    }
}
