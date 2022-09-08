const axios = require('axios');
const { create } = require('xmlbuilder2');
const fs = require('fs');

var CONFIG = {};

const root = create({ version: '1.0' });
var rss = root.ele('rss', {'version': '2.0', 'xmlns:g': 'http://base.google.com/ns/1.0'});
var channel = rss.ele('channel');

channel.ele('title').txt('Valejet');
channel.ele('link').txt('https://www.valejet.com');
channel.ele('description').txt('Valejet.com conta com a linha mais completa de Toner, Cartucho de Tinta, Refis de Toner, Tintas para Impressora e muito outros insumos, Aproveite!');

const rootTemp = create({ version: '1.0' });
var rssTemp = rootTemp.ele('rss', {'version': '2.0', 'xmlns:g': 'http://base.google.com/ns/1.0'});
var channelTemp = rssTemp.ele('channel');

channelTemp.ele('title').txt('Valejet');
channelTemp.ele('link').txt('https://www.valejet.com');
channelTemp.ele('description').txt('Valejet.com conta com a linha mais completa de Toner, Cartucho de Tinta, Refis de Toner, Tintas para Impressora e muito outros insumos, Aproveite!');


// 100 req por minuto.
const LI_API_URL = 'https://api.awsli.com.br';
const LI_CHAVE_APLICACAO = '533b216d-793e-406e-b4c7-4344d67d1d31';
const LI_CHAVE_API = '79546b645a1134421c68';
const LI_LIMITE = 100;
let REQ_COUNT = 0;
let LAST_DATE = new Date();

let CATEGORIES = {}
let CATEGORIES_BY_EID = {}
let BRANDS = {}
let PRODUCTS = [];
var PRODUCTS_TEMP_JSON = {};

const sleep = (ms) => {
    return new Promise(resolve => setTimeout(resolve, ms));
}

setInterval( function(){
    LAST_DATE = new Date();
    REQ_COUNT = 0;
},60000)

const AwaitReqLI = async () => {
    const lastDate = LAST_DATE;
    const endDate = new Date();
    const minutes = parseInt(Math.abs(endDate.getTime() - lastDate.getTime()) / (1000 * 60) % 60);
    const seconds = parseInt(Math.abs(endDate.getTime() - lastDate.getTime()) / (1000) % 60);

    REQ_COUNT++;
    
    if( REQ_COUNT >= 100 && seconds < 60 ){
        var sleepSeconds = 60-seconds;
        console.log(`DEVE AGUARDAR ${sleepSeconds}s`);
        await sleep(sleepSeconds * 1000);
        REQ_COUNT = 0;
        LAST_DATE = new Date();
    }
    console.log(`${REQ_COUNT} requisições em ${minutes}:${seconds}`);
}

const ExecGET_LI = async (type, id=null, offset=0, limit=20, params='') => {
    await AwaitReqLI();

    var result = null;

    var refTypes = {
        'category': '/v1/categoria',
        'brand': '/v1/marca',
        'product': '/v1/produto',
        'image': '/v1/produto_imagem/',
        'price': '/v1/produto_preco',
        'stock': '/v1/produto_estoque',
    }

    var config = {
        method: 'GET',
        url: `${LI_API_URL}${type}?a=1&${params}chave_aplicacao=${LI_CHAVE_APLICACAO}&chave_api=${LI_CHAVE_API}&limit=${limit}&offset=${offset}`,
        async: true,
    };
    if( type in refTypes ){
        config.url = `${LI_API_URL}${refTypes[type]}${id!=null?'/'+id:''}?chave_aplicacao=${LI_CHAVE_APLICACAO}&chave_api=${LI_CHAVE_API}&limit=${limit}&offset=${offset}`;
    }
    // console.log(config.url)

    await axios(config)
        .then( async (response) => {
            var data = response.data;
            result = data;
        })
        .catch(function (error) {
            console.log(error);
            result = null;
        });

    return result;
}

const TotalCountToNRequest = async (total) => {
    if( total > 20 ){
        return Math.ceil(total / 20) - 1;
    }else{
        return 0;
    }
}

const GET_Categories = async () => {

    var haveBKP = true;
    try {
        var dataByFile = fs.readFileSync('categories.json', {encoding:'utf8', flag:'r'});
        if ( dataByFile && dataByFile != '{}' ){
            CATEGORIES = JSON.parse(dataByFile);
        }else{
            haveBKP = false;
        }
        var dataByFile = fs.readFileSync('categories_by_eid.json', {encoding:'utf8', flag:'r'});
        if ( dataByFile && dataByFile != '{}' ){
            CATEGORIES_BY_EID = JSON.parse(dataByFile);
        }else{
            haveBKP = false;
        }
    } catch (error) {
        console.log(error);
        haveBKP = false;
    }

    if( haveBKP ){
        console.log('CATEGORIAS BY BKP');
        return true;
    }

    console.log('INICIANDO CONSULTA DE CATEGORIAS');
    const GetCategoryInfo = (data) => {
        for( var x = 0; x < data.objects.length; x++ ){
            var o = data.objects[x];
            var parent = null;
            var parent_eid = false;
            if( typeof o.categoria_pai == 'string' && o.categoria_pai.indexOf('/') >= 0 ){
                parent = parseInt(o.categoria_pai.split('/')[4]);
                parent_eid = (o.categoria_pai.indexOf('?id_externo=1') >= 0)
            }
            CATEGORIES[o.id] = { 'name': o.nome, 'parentId': (parent != null) ? parent.toString() : parent, 'eid': parent_eid };
            if( typeof o.id_externo == 'number' && o.id_externo > 0 ){
                CATEGORIES_BY_EID[o.id_externo] = o.id;
            }
        }
    }
    var data = await ExecGET_LI('category');
    var qtdNext = await TotalCountToNRequest(data.meta.total_count);

    // console.log(qtdNext)
    GetCategoryInfo(data);
    for( var x = 1; x <= qtdNext; x++ ){
        console.log(`CONSULTANDO CATEGORIAS ${x}/${qtdNext}`);
        data = await ExecGET_LI('category', null, x*20);
        GetCategoryInfo(data);
    }

    await createFileBkp('categories.json', JSON.stringify(CATEGORIES));
    await createFileBkp('categories_by_eid.json', JSON.stringify(CATEGORIES_BY_EID));

}

const prepareCategoryText = async (category) => {
    if( !(category in CATEGORIES) ){
        return '';
    }
    // console.log('entrou')
    var thisCategory = CATEGORIES[category];

    var result = '';
    while( thisCategory != null ){
        if( result == '' ){
            result = thisCategory.name;
        }else{
            result = `${thisCategory.name} > ${result}`;
        }
        if( thisCategory.parentId != null ){
            if( thisCategory.parentId in CATEGORIES ){
                thisCategory = CATEGORIES[thisCategory.parentId];
            }else if( thisCategory.eid && thisCategory.parentId in CATEGORIES_BY_EID && CATEGORIES_BY_EID[thisCategory.parentId] in CATEGORIES ){
                thisCategory = CATEGORIES[CATEGORIES_BY_EID[thisCategory.parentId]];
            }else{
                thisCategory = null;
            }
        }else{
            thisCategory = null;
        }
    }
    return result;
}

const GET_Brands = async () => {

    var haveBKP = true;
    try {
        var dataByFile = fs.readFileSync('brands.json', {encoding:'utf8', flag:'r'});
        if ( dataByFile && dataByFile != '{}' ){
            BRANDS = JSON.parse(dataByFile);
        }else{
            haveBKP = false;
        }
    } catch (error) {
        console.log(error);
        haveBKP = false;
    }

    if( haveBKP ){
        console.log('MARCAS BY BKP');
        return true;
    }

    console.log('INICIANDO CONSULTA DE MARCAS');
    const GetInfo = (data) => {
        for( var x = 0; x < data.objects.length; x++ ){
            var o = data.objects[x];

            BRANDS[o.id] = o.nome;
        }
    }
    var data = await ExecGET_LI('brand');
    var qtdNext = await TotalCountToNRequest(data.meta.total_count);

    // console.log(qtdNext)
    GetInfo(data);
    for( var x = 1; x <= qtdNext; x++ ){
        console.log(`CONSULTANDO MARCAS ${x}/${qtdNext}`);
        data = await ExecGET_LI('brand', null, x*20);
        GetInfo(data);
    }

    await createFileBkp('brands.json', JSON.stringify(BRANDS));

}
const GET_Products = async () => {

    var haveBKP = true;
    try {
        var dataByFile = fs.readFileSync('products.txt', {encoding:'utf8', flag:'r'});
        if ( dataByFile && dataByFile != '' ){
            PRODUCTS = dataByFile.split(',');
        }else{
            haveBKP = false;
        }
    } catch (error) {
        console.log(error);
        haveBKP = false;
    }

    if( haveBKP ){
        console.log('PRODUTOS BY BKP');
        return true;
    }

    console.log('INICIANDO CONSULTA DE PRODUTOS');
    const GetInfo = async (data) => {
        for( var x = 0; x < data.objects.length; x++ ){
            var o = data.objects[x];
            if( o.ativo && !o.removido ){
                PRODUCTS.push(o.id);
            }
        }
    }
    var data = await ExecGET_LI('product', null, 0, 20, '&ativo=true&removido=false');
    var qtdNext = await TotalCountToNRequest(data.meta.total_count);

    await GetInfo(data);
    for( var x = 1; x <= qtdNext; x++ ){
        console.log(`CONSULTANDO PRODUTOS ${x}/${qtdNext}`);
        data = await ExecGET_LI('product', null, x*20, 20, '&ativo=true&removido=false');
        GetInfo(data);
    }

    await createFileBkp('products.txt', PRODUCTS.join(','));
};

const GET_Product = async (id) => {
    console.log('INICIANDO CONSULTA DE PRODUTOS');
    const GetInfo = async (data) => {
        if( data != null && data != undefined && 'id' in data ){
            console.log(`CONSULTANDO DADOS DO PRODUTO ${data.id}`);
            var o = data;

            var descriptionSEO = '';
            var image = '';
            var price = '';
            var salePrice = '';
            var inStock = '';
            
            var dataSTOCK = await ExecGET_LI('stock', o.id);
            if( typeof dataSTOCK == 'object' && 'id' in dataSTOCK && 'gerenciado' in dataSTOCK ){
                if( ( !dataSTOCK['gerenciado'] ) || ( dataSTOCK['gerenciado'] && dataSTOCK['quantidade_disponivel'] > 0 ) ){
                    inStock = 'in stock';
                }else{
                    return false;
                }
            }

            if( o.seo != null && o.seo != '' ){
                var dataSEO = await ExecGET_LI(o.seo);
                if( dataSEO != null && dataSEO != undefined && typeof dataSEO == 'object' && 'id' in dataSEO && 'description' in dataSEO ){
                    descriptionSEO = dataSEO.description;
                }
            }
            // console.log(o.imagem_principal)
            if( o.imagem_principal != null && typeof o.imagem_principal == 'object' && 'id' in o.imagem_principal && 'grande' in o.imagem_principal ){
                image = o.imagem_principal.grande;
            }
            var dataPRICE = await ExecGET_LI('price', o.id);
            if( typeof dataPRICE == 'object' && dataPRICE != null  && 'id' in dataPRICE && 'cheio' in dataPRICE ){
                var realPrice = parseFloat(dataPRICE['cheio']);

                price = `${realPrice.toFixed(2)} BRL`;

                if( CONFIG.desconto != undefined && CONFIG.desconto != null && typeof CONFIG.desconto == 'number' ){
                    var pctDesconto = parseFloat(CONFIG.desconto) / 100;
                    salePrice = ( realPrice - ( realPrice * pctDesconto ) );
                    salePrice = `${salePrice.toFixed(2)} BRL`;
                }

                // if( dataPRICE['promocional'] != null ){
                //     salePrice = `${parseFloat(dataPRICE['promocional']).toFixed(2)} BRL`;
                // }
            }

            var brandId = null;
            var brand = '';
            if( typeof o.marca == 'string' && o.marca.indexOf('/') >= 0 ){
                brandId = parseInt(o.marca.split('/')[4])

                if( brandId in BRANDS ){
                    brand = BRANDS[brandId];
                }
            }

            var category = '';
            if( typeof o.categorias == 'object' && o.categorias.length ){
                category = await prepareCategoryText(parseInt(o.categorias.pop().split('/').pop()).toString());
            }

            PRODUCTS_TEMP_JSON[o.id] = {
                'title': o.nome,
                'link': o.url,
                'description': descriptionSEO,
                'g:image_link': image,
                'g:price': price,
                'g:sale_price': salePrice,
                'g:condition': 'new',
                'g:availability': inStock,
                'g:id': o.sku,
                'g:brand': brand,
                'g:product_type': category,
                'g:gtin': o.gtin,
                'g:online_only': 'y',
            }

            await createFileBkp('products_temp_import.json', JSON.stringify(PRODUCTS_TEMP_JSON));

            await CreateXMLProducts(true, PRODUCTS_TEMP_JSON[o.id]);
            
            var xmlTemp = rootTemp.end({
                pretty: true
            });
           
            fs.writeFile('import_temp.xml', xmlTemp, function (err) {
                if (err) throw err;
                console.log('File is created successfully.');
            });
        }
    }
    var data = await ExecGET_LI('product', id);
    await GetInfo(data);
}

const createFileBkp = async (name, txt) => {
    await fs.writeFile(name, txt, function (err) {
        if (err) throw err;
        console.log('File is created successfully.');
    });
}

const CreateXMLProducts = async(temp=false, item=null) => {

    function create(p){
        var channelItem = null;
        if( temp ){
            channelItem = channelTemp.ele('item')
        }else{
            channelItem = channel.ele('item')
        }
        channelItem.ele('title').ele({'$': p['title']});
        channelItem.ele('link').ele({'$': p['link']});
        channelItem.ele('description').ele({'$': p['description']});
        channelItem.ele('g:image_link').txt(p['g:image_link']);
        channelItem.ele('g:price').txt(p['g:price']);
        channelItem.ele('g:sale_price').txt(p['g:sale_price']);
        channelItem.ele('g:condition').txt(p['g:condition']);
        channelItem.ele('g:availability').txt(p['g:availability']);
        channelItem.ele('g:id').ele({'$': p['g:id']});
        channelItem.ele('g:brand').ele({'$': p['g:brand']});
        channelItem.ele('g:product_type').ele({'$': p['g:product_type']});
        channelItem.ele('g:gtin').ele({'$': p['g:gtin']});
        channelItem.ele('g:online_only').txt(p['g:online_only']);
    }

    if( item != null ){
        create(item);
    }else{
        for( var product in PRODUCTS_TEMP_JSON ){
            var p = PRODUCTS_TEMP_JSON[product];
            create(p);
        }
    }

}

const init = async () => {

    try {
        var config = fs.readFileSync('config_nao_apagar.json', {encoding:'utf8', flag:'r'});
        if ( config && config != '{}' ){
            CONFIG = JSON.parse(config);
        }else{
            CONFIG = {};
        }
    } catch (error) {
        console.log(error);
        CONFIG = {};
    }

    await GET_Categories();
    await GET_Brands();
    await GET_Products();

    try {
        var produts_json = fs.readFileSync('products_temp_import.json', {encoding:'utf8', flag:'r'});
        PRODUCTS_TEMP_JSON = JSON.parse(produts_json);

        await CreateXMLProducts(true);
    } catch (error) {
        console.log(error);
        PRODUCTS_TEMP_JSON = {};
    }
    
    var products_length = PRODUCTS.length;
    var last_product_read = 0;
    try {
        var dataByFile = fs.readFileSync('product_index.txt', {encoding:'utf8', flag:'r'});
        if ( dataByFile && dataByFile != '' ){
            var product_index = parseInt(dataByFile.trim());

            if( product_index <= products_length ){
                last_product_read = product_index;
            }
        }
    } catch (error) {
        console.log(error);
        last_product_read = 0;
    }

    for( var x = last_product_read; x < PRODUCTS.length; x++ ){
        console.log(`CONSULTANDO PRODUTO ${x}/${PRODUCTS.length}`);
        var product = PRODUCTS[x];
        
        await GET_Product(product);
        await createFileBkp('product_index.txt', `${x}`);
    }

    await CreateXMLProducts();

    var xml = root.end({
        pretty: true
    });
    
    fs.writeFile('import.xml', xml, function (err) {
        if (err) throw err;
        console.log('File is created successfully.');
    });

    AwaitReqLI();
}

init();
