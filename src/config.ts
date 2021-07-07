import { IPayment } from './charge'

export interface IConfig {
    /**
     * admin roles
     */
    roles: string[]

    /**
     * Payments
     */
    payments: IPayment[]
}
