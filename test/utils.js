const chai = require('chai')
const script_path = "/home/sev/Work/agent-api-spec/swagger-spec.yaml"
const chaiResponseValidator = require('chai-openapi-response-validator')
chai.use(chaiResponseValidator(script_path))

const axios = require('axios')
const data = require('./data')
const { assert, expect } = require('chai')

const URL = {
    agents: ["http://localhost:8150", "http://localhost:8151"],
    create_admin_inv: "/connections/create-admin-invitation-url",
    create_inv: "/connections/create-invitation?alias=agent_connection&auto_accept=true&multi_use=true",
    receive_inv: "/connections/receive-invitation?auto_accept=true",
    create_did: "/wallet/did/create",
    LEDGER_URL: "http://localhost:9000",
    set_public_did: "/wallet/did/public",
    pds_settings: '/pds/settings',
    consents: "/consents",
    services: '/services',
    services_add: '/services/add',
    apply: '/services/apply',
    requestServices: (connID) => `/connections/${connID}/services`
}


const InvalidCodepath = data.InvalidCodepath

let Util = {
    post: async function (url, data, status = 200, shouldSatisfySpec = true) {
        try {
            result = await axios.post(url, data)
            expect(result.status).to.equal(status)
            if (shouldSatisfySpec)
                expect(result).to.satisfyApiSpec
        } catch (error) {
            InvalidCodepath(error)
        }
        return result
    },
    get: async function (url, status = 200) {
        try {
            result = await axios.get(url)
            expect(result.status).to.equal(status)

        } catch (error) {
            InvalidCodepath(error)
        }
        return result
    },
    randomNumber: function () {
        return String(Math.floor(Math.random() * Math.floor(10000)));
    },
    InvalidCodepath: InvalidCodepath,
    ConnectAgents: async function (agent) {

        let connections = []
        let admin_data = ["", ""]

        function ProcessInviteURL(URL) {
            // Grab the query parameters
            index = URL.indexOf("?c_i=") + 5
            let substring = URL.substring(index)

            let content = new Buffer(substring, "base64").toString("ascii")
            content = JSON.parse(content)
            return content
        }

        for (i in [0, 1]) {
            try {
                admin_data[i] = await axios.post(agent[i] + URL.create_admin_inv)
                admin_data[i] = admin_data[i].data['invitation_url']
                admin_data[i] = ProcessInviteURL(admin_data[i])
            }
            catch (error) {
                InvalidCodepath(error, "Agent" + String(i))
            }
        }

        let invi = [undefined, undefined]
        for (i in [0, 1]) {
            try {
                let res = await axios.post(agent[i] + URL.create_inv)
                invi[i] = res.data
            }
            catch (error) {
                InvalidCodepath(error, "Agent" + String(i))
            }
        }
        let j = 1
        for (i in [0, 1]) {
            try {
                let res = await axios.post(agent[i] + URL.receive_inv, {
                    "label": "Bob",
                    "recipientKeys": invi[j]['invitation']['recipientKeys'],
                    "serviceEndpoint": invi[j]['invitation']['serviceEndpoint'],
                })
                connections.push(res.data)
            } catch (error) {
                InvalidCodepath(error, "Agent" + String(i))
            }
            j--
        }

        return connections
    },
    CreateAndRegisterDID: async function (agent) {
        let did
        let verkey
        let alias = agent

        let res = await axios.post(agent + URL.create_did)
        did = res.data['result']['did']
        verkey = res.data['result']['verkey']
        assert(did)
        assert(verkey)

        res = await axios.post(URL.LEDGER_URL + "/register", {
            "did": did, "verkey": verkey, "alias": alias, "role": "ENDORSER"
        })

        return did
    },
    SetupDIDs: async function (agent) {
        let did = []
        for (i in [0, 1]) {
            did.push(await Util.CreateAndRegisterDID(agent[i]))
        }
        for (i in [0, 1]) {
            let res = await axios.post(agent[i] + URL.set_public_did + "?did=" + did[i])
        }
        return did
    },
    WebhookCacher: class {
        constructor(port) {
            const WebSocket = require('ws')
            let url = "ws://localhost:" + String(port)
            // console.log("webhook url:", url)
            this.ws = new WebSocket(url)
            this.event_queue = []
            this.onmessage = function (message) {
                console.log("queue:", this.event_queue.length)
                let message_json = JSON.parse(message.data)
                message_json['message'] = JSON.parse(message_json['message'])
                this.event_queue.push(message_json)
            }


            this.ws.onmessage = this.onmessage.bind(this)
            this.ws.onopen = function (wss) {
                console.log(url, "connected!")
            }
        }

        terminate() {
            this.ws.terminate()
        }

        _webhookSeek(topic) {
            let formatted_topic = "/topic" + topic
            for (let i = 0; i < this.event_queue.length; i++) {
                if (this.event_queue[i]['topic'] == formatted_topic) {
                    return this.event_queue[i]['message']
                }
            }
            return undefined
        }

        webhookSeek(topic) {
            return new Promise(resolve => {
                setTimeout(() => {
                    resolve(this._webhookSeek(topic));
                }, 200);
            });
        }
    }

}

module.exports = {
    URL, Util
}