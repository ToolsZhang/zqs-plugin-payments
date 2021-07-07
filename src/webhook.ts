const webhooks: IWebhook[] = []

export interface IWebhook {
    path: string
    prefix: string
}

export function addWebhook(path: string, prefix: string) {
    webhooks.push({
        path: path,
        prefix: prefix,
    })
}

export function getWebhook(path: string): IWebhook {
    return webhooks.find(x => x.path === path)
}
