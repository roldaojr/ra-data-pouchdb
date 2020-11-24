import { v4 as uuidv4 } from 'uuid'

const keyAsNameAndId = row => ({
    id: row.key, name: row.key,
    ...row.value
})

export default (database, {...options}) => {
    const asyncDatabase = Promise.resolve(database)
    const viewResources = options.viewResources || {}
    const separator = options.resourceSeparator || '/'
    const setRecordId = doc => ({...doc, id: doc._id.split(separator)[1]})
    const getDocId = (resource, id) => `${resource}${separator}${id}`
    const dataRequest = async (type, resource, params) => {
        const db = await asyncDatabase
        switch (type) {
            case 'getOne':
                return {data: setRecordId(
                    await db.get(getDocId(resource, params.id))
                )}
            case 'getList':
                const page = (params.pagination && params.pagination.page != null) ? params.pagination.page : 1
                const perPage = (params.pagination && params.pagination.perPage != null) ? params.pagination.perPage : 10
                let field = (params.sort && params.sort.field != null) ? params.sort.field : "_id"
                const order = (params.sort && params.sort.order != null) ? params.sort.order : "ASC"
                if (field === 'id') field = '_id'
                let query = {
                    selector: {_id: {
                        '$gt': `${resource}/`,
                        '$lt': `${resource}/\ufff0`
                    }}
                };
                for (const [key, value] of Object.entries(params.filter)) {
                    query.selector[key] = {
                        $regex: new RegExp(`.*${value}.*`, 'i')
                    };
                }
                const listResp = await db.find(query)
                const total_rows = listResp.docs.length
                const pagedListResp = await db.find({
                    ...query,
                    sort: [{[field]: (order.toLowerCase())}],
                    limit: perPage,
                    skip: ((page - 1) * perPage)
                })
                return {
                    data: pagedListResp.docs.map(setRecordId),
                    total: total_rows
                }
            case 'getMany':
                const manyResp = db.allDocs({
                    include_docs: true,
                    keys: params.ids.map(id => getDocId(resource, id))
                });
                return {
                    data: manyResp.docs.map(setRecordId),
                    total: manyResp.total_rows
                }
            case 'getManyReference':
                const manyRefResp = db.find({
                    selector: {[params.target]: params.id}
                });
                return {
                    data: manyRefResp.docs.map(setRecordId),
                    total: manyRefResp.total_rows
                }
            case 'create':
                const idFunc = options.idFunc || uuidv4
                params.data._id = getDocId(resource, idFunc(params.data))
                return {data: await db.put(params.data)}
            case 'update':
                params.data._id = getDocId(resource, params.data.id)
                delete params.data.id
                return {data: await db.put(params.data)}
            case 'delete':
                const doc = await db.get(getDocId(resource, params.id))
                return {data: await db.remove(doc)}
            case 'deleteMany':
                const result = await db.allDocs({
                    keys: params.ids.map(id => getDocId(resource, id))
                })
                const deleteDocs = result.rows.map(row => ({
                    _id: getDocId(resource, row.id),
                    _rev: row.value.rev,
                    _deleted: true
                }))
                return {data: await db.bulkDocs(deleteDocs)}
            default:
                return Promise.reject(
                    new Error(`Unsupported fetch action type ${type}`)
                )
        }
    }

    const mapReduceRequest = async(options, type, params) => {
        const db = await asyncDatabase
        const {view, query, func} = options
        let result, rows
        switch(type) {
            case 'getList':
                const page = (params.pagination && params.pagination.page != null) ? params.pagination.page : 1;
                const perPage = (params.pagination && params.pagination.perPage != null) ? params.pagination.perPage : 10;
                result = await db.query(view, {
                    limit: perPage, skip: ((page - 1) * perPage),
                    ...query
                })           
                break
            case 'getMany':
                result = await db.query(view, {
                    keys: params.ids, ...query
                })
                break
            case 'getOne':
                result = await db.query(view, {
                    key: params.id, ...query
                })
                break
            default:
                return Promise.reject(
                    new Error(`Unsupported fetch action type ${type}`)
                )
        }
        rows = result.rows.map(func || keyAsNameAndId)
        return {data: rows, total: rows.length}
    }

    const handle = async (type, resource, params) => {
        if(viewResources[resource]) {
            return mapReduceRequest(viewResources[resource], type, params)
        } else {
            return dataRequest(type, resource, params)
        }
    }

    return {
        database: asyncDatabase,
        getList: (resource, params) => handle('getList', resource, params),
        getOne: (resource, params) => handle('getOne', resource, params),
        getMany: (resource, params) => handle('getMany', resource, params),
        getManyReference: (resource, params) =>
            handle('getManyReference', resource, params),
        update: (resource, params) => handle('update', resource, params),
        updateMany: (resource, params) =>
            handle('updateMany', resource, params),
        create: (resource, params) => handle('create', resource, params),
        delete: (resource, params) => handle('delete', resource, params),
        deleteMany: (resource, params) =>
            handle('deleteMany', resource, params),
    }
}
