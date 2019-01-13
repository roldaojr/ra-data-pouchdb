import {
    GET_LIST,
    GET_ONE,
    GET_MANY,
    GET_MANY_REFERENCE,
    CREATE,
    UPDATE,
    DELETE,
} from 'react-admin';
import PouchDB from 'pouchdb';
import PouchDB_find from 'pouchdb-find';
import shortuuid from 'short-uuid';

PouchDB.plugin(PouchDB_find);

const fromPouchDoc = (doc) => {
    doc.id = doc._id.split('/')[1];
    return doc;
}

export default (database) => {
    var db = new PouchDB(database);   
    /**
     * @param {String} type One of the constants appearing at the top if this file, e.g. 'UPDATE'
     * @param {String} resource Name of the resource to fetch, e.g. 'posts'
     * @param {Object} params The REST request params, depending on the type
     * @returns {Object} { url, options } The HTTP request parameters
     */
    const convertRESTRequestToPouch = (type, resource, params) => {
        switch (type) {
            case GET_LIST:
                const page = (params.pagination && params.pagination.page != null) ? params.pagination.page : 1;
                const perPage = (params.pagination && params.pagination.perPage != null) ? params.pagination.perPage : 10;
                let field = (params.sort && params.sort.field != null) ? params.sort.field : "_id";
                const order = (params.sort && params.sort.order != null) ? params.sort.order : "ASC";
                if (field === 'id') field = '_id';
                let query = {
                    selector: {_id: {
                        '$gt': `${resource}/`,
                        '$lt': `${resource}/\ufff0`
                    }},
                    sort: [{[field]: (order.toLowerCase())}],
                    limit: perPage,
                    skip: ((page - 1) * perPage)
                };
                return db.find(query);
            case GET_ONE:
                return db.get(`${resource}/${params.id}`);
            case GET_MANY:
                return db.allDocs({
                    include_docs: true,
                    keys: params.ids.map(id => `${resource}/${id}`)
                });
            case GET_MANY_REFERENCE:
                return db.find({
                    selector: {[params.target]: params.id}
                });
            case CREATE:
                let uuid = shortuuid.generate();
                params.data._id = `${resource}/${uuid}`;
                return db.put(params.data);
            case UPDATE:
                delete params.data.id;
                return db.put(params.data);
            case DELETE:
                return db.get(`${resource}/${params.id}`).then(doc => {
                    return db.remove(doc)
                });
            default:
                throw new Error(`Unsupported fetch action type ${type}`);
        }
    }

    /**
     * @param {Object} response HTTP response from fetch()
     * @param {String} type One of the constants appearing at the top if this file, e.g. 'UPDATE'
     * @param {String} resource Name of the resource to fetch, e.g. 'posts'
     * @param {Object} params The REST request params, depending on the type
     * @returns {Object} REST response
     */
    const convertPouchResponseToREST = (response, type, resource, params) => {
        switch (type) {
            case GET_ONE:
                return {data: fromPouchDoc(response)};
            case GET_LIST:
            case GET_MANY_REFERENCE:
                return {
                    data: response.docs.map(fromPouchDoc),
                    total: response.docs.length
                };
            case GET_MANY:
                return {
                    data: response.rows.map(r => fromPouchDoc(r.doc)),
                    total: response.total_rows
                };
            case CREATE:
            case UPDATE:
            case DELETE:
            default:
                return {data: response};
        }
    }

    /**
     * @param {string} type Request type, e.g GET_LIST
     * @param {string} resource Resource name, e.g. "posts"
     * @param {Object} payload Request parameters. Depends on the request type
     * @returns {Promise} the Promise for a REST response
     */
    return (type, resource, params) => {
        const response = convertRESTRequestToPouch(type, resource, params);
        return Promise.resolve(response).then(
            response => convertPouchResponseToREST(response, type, resource, params));
    };
}
