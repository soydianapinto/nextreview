type NotifyUpdateMessage = {
  action: 'NOTIFY_UPDATE'
  payload?: {
    title?: string
    message?: string
  }
}

chrome.runtime.onMessage.addListener((message: NotifyUpdateMessage) => {
  if (message.action !== 'NOTIFY_UPDATE') {
    return
  }

  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icon-128.png',
    title: message.payload?.title ?? 'Next Review',
    message: message.payload?.message ?? 'There is a new PR queue update.',
  })
})
