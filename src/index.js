import { generate as shortUUID } from 'short-uuid'


const dataProvider = (database, {
    viewResources = {},
    resourceSeparator = ':',
    docId = shortUUID
}) => {
    const getRecordId = id => (
        id.split(resourceSeparator)[1]
    )
    const formatDocId = (resource, id) => (
        `${resource}${resourceSeparator}${id}`
    )
    const docIdToRecordId = ({_id, ...doc}) => ({
        ...doc, id: _id.split(resourceSeparator)[1]
    })

    const asyncDatabase = Promise.resolve(database)

    const dataRequest = async (type, resource, params = {}) => {
        const db = await asyncDatabase
        switch (type) {
            case 'getOne':
                return {data: docIdToRecordId(
                    await db.get(formatDocId(resource, params.id))
                )}
            case 'getList':
                const page = (params.pagination && params.pagination.page != null) ? params.pagination.page : 1
                const perPage = (params.pagination && params.pagination.perPage != null) ? params.pagination.perPage : 10
                let field = (params.sort && params.sort.field != null) ? params.sort.field : "_id"
                const order = (params.sort && params.sort.order != null) ? params.sort.order : "ASC"
                if (field === 'id') field = '_id'
                let query = {
                    selector: {_id: {
                        '$gt': `${resource}${resourceSeparator}`,
                        '$lt': `${resource}${resourceSeparator}\ufff0`
                    }}
                }
                if(params.filter) {
                    for (const [key, value] of Object.entries(params.filter)) {
                        query.selector[key] = { $eq: value }
                    }
                }
                const pagedListResp = await db.find({
                    ...query,
                    sort: [{[field]: (order.toLowerCase())}],
                    limit: perPage,
                    skip: ((page - 1) * perPage)
                })
                return {
                    data: pagedListResp.docs.map(docIdToRecordId),
                    total: (await db.info()).doc_count
                }
            case 'getMany':
                const manyResp = await db.allDocs({
                    include_docs: true,
                    keys: params.ids.map(id => formatDocId(resource, id))
                });
                return {
                    data: manyResp.docs.map(docIdToRecordId),
                    total: manyResp.total_rows
                }
            case 'getManyReference':
                const manyRefResp = await db.find({
                    selector: {[params.target]: params.id}
                });
                return {
                    data: manyRefResp.docs.map(docIdToRecordId),
                    total: manyRefResp.total_rows
                }
            case 'create':
                params.data._id = formatDocId(resource, docId(params.data))
                return {data: await db.put(params.data)}
            case 'update':
                const {id, ...updateDoc} = params.data
                updateDoc._id = formatDocId(resource, id)
                const updateResult = await db.put(updateDoc)
                return {data: {id: getRecordId(updateResult.id)}}
            case 'delete':
                const doc = await db.get(formatDocId(resource, params.id))
                const deleteResult = await db.remove(doc)
                return {data: {id: getRecordId(deleteResult.id)}}
            case 'deleteMany':
                const result = await db.allDocs({
                    keys: params.ids.map(id => formatDocId(resource, id))
                })
                const deleteDocs = result.rows.map(row => ({
                    _id: formatDocId(resource, row.id),
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

    const mapReduceRequest = async(options, type, params = {}) => {
        const db = await asyncDatabase        
        const keyAsNameAndId = row => ({
            id: row.key, name: row.key,
            ...row.value
        })

        const {view, query, func} = options
        let filter = {}
        let pagination = {}
        if(params.filter && params.filter.q) {
            filter = {
                startKey: `${params.filter.q}`,
                endKey: `${params.filter.q}\ufff0`
            }
        }
        let result, rows, total
        switch(type) {
            case 'getList':
                if(params.pagination && params.pagination.perPage) {
                    const page = params.pagination.page || 1
                    const perPage = params.pagination.perPage
                    pagination = {
                        limit: perPage,
                        skip: ((page - 1) * perPage)
                    }
                }
                result = await db.query(view, {
                    ...query, ...filter, ...pagination
                })
                total = (await db.info()).doc_count
                rows = result.rows.map(func || keyAsNameAndId)
                return {data: rows, total}
            case 'getMany':
                result = await db.query(view, {
                    keys: params.ids, ...query
                })
                total = result.rows.length
                rows = result.rows.map(func || keyAsNameAndId)
                return {data: rows, total}
            case 'getOne':
                result = await db.query(view, {
                    key: params.id, ...query
                })
                if(result.rows.length > 0) {
                    return {data: result.rows.map(func || keyAsNameAndId)[0]}
                } else {
                    return Promise.reject(new Error(`Not found`))
                }
            default:
                return Promise.reject(
                    new Error(`Unsupported fetch action type ${type}`)
                )
        }
    }

    const handle = async (type, resource, params) => {
        if(viewResources[resource]) {
            return mapReduceRequest(viewResources[resource], type, params)
        } else {
            return dataRequest(type, resource, params)
        }
    }

    return {
        getDatabase: () => asyncDatabase,
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

export default dataProvider
