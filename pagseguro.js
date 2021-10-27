const parseXml = require('xml2js');
const axios = require('axios');
const apiToken = '9Gt7Nph_bY4NQ';

module.exports = {
    processNotification: this.processNotification,
};

const processNotification = async (notification, clientSlug, baseUrlApi) => {
    //notification.notificationType = transaction ;  @TODO: verify another types

    // we should request
    const pagseguroInfo = await fetchClientPagseguroInfo(clientSlug, baseUrlApi);
    if (!pagseguroInfo) {
        return false;
    }

    const notificationInfo = await fetchNotificationInfo(pagseguroInfo.token, pagseguroInfo.email, notification.notificationCode);
    if (!notificationInfo) {
        return false;
    }
    
    return notificationInfo;
}

const fetchClientPagseguroInfo = async (clientSlug, baseUrlApi) => {
    const response = await axios.get(baseUrlApi + '/restaurantes/nodePagseguroInfo/' + clientSlug + '/' + apiToken);
    if (response.data.status != 'ok') {
        return false;
    }

    return {
        token: response.data.data.token,
        email: response.data.data.email
    }
}

const fetchNotificationInfo = async (token, email, notification_id) => {
    const sandbox = true;
    let linkNotification;
    if (sandbox) {
        linkNotification = 'https://ws.sandbox.pagseguro.uol.com.br/v2/transactions/notifications';
    } else {
        linkNotification = 'https://ws.pagseguro.uol.com.br/v2/transactions/notifications';
    }

    linkNotification += '/' + notification_id + '?email=' + email + '&token=' + token;

    const response = await axios.get(linkNotification);
    if (response.data == 'Unathorized') {
        return false;
    }

    const responseData = await parseXml.parseString(response.data);
    console.log(responseData);
    console.log(responseData.reference);
    console.log(responseData.status);

    return responseData;
}