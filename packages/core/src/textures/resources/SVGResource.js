import { decomposeDataUri, uid } from '@pixi/utils';
import BaseImageResource from './BaseImageResource';

/**
 * Resource type for SVG elements and graphics.
 * @class
 * @extends PIXI.resources.BaseImageResource
 * @memberof PIXI.resources
 * @param {string} source - Base64 encoded SVG element or URL for SVG file.
 * @param {object} [options] - Options to use
 * @param {number} [options.scale=1] Scale to apply to SVG.
 * @param {boolean} [options.autoLoad=true] Start loading right away.
 */
export default class SVGResource extends BaseImageResource
{
    constructor(source, options)
    {
        options = options || {};

        super(document.createElement('canvas'));

        /**
         * Base64 encoded SVG element or URL for SVG file
         * @readonly
         * @member {string}
         */
        this.svg = source;

        /**
         * The source scale to apply to render
         * @readonly
         * @member {number}
         */
        this.scale = options.scale || 1;

        /**
         * Call when completely loaded
         * @private
         * @member {function}
         */
        this._resolve = null;

        /**
         * Promise when loading
         * @member {Promise<void>}
         * @private
         * @default null
         */
        this._load = null;

        if (options.autoLoad !== false)
        {
            this.load();
        }
    }

    load()
    {
        if (this._load)
        {
            return this._load;
        }

        this._load = new Promise((resolve) =>
        {
            // Save this until after load is finished
            this._resolve = () =>
            {
                this.resize(this.source.width, this.source.height);
                resolve(this);
            };

            // Convert SVG inline string to data-uri
            if ((/^\<svg/).test(this.svg.trim()))
            {
                this.svg = `data:image/svg+xml;utf8,${this.svg}`;
            }

            // Checks if `source` is an SVG image and whether it's
            // loaded via a URL or a data URI. Then calls
            // `_loadDataUri` or `_loadXhr`.
            const dataUri = decomposeDataUri(this.svg);

            if (dataUri)
            {
                this._loadDataUri(dataUri);
            }
            else
            {
                // We got an URL, so we need to do an XHR to check the svg size
                this._loadXhr();
            }
        });

        return this._load;
    }

    /**
     * Reads an SVG string from data URI and then calls `_loadString`.
     *
     * @param {string} dataUri - The data uri to load from.
     */
    _loadDataUri(dataUri)
    {
        let svgString;

        if (dataUri.encoding === 'base64')
        {
            if (!atob)
            {
                throw new Error('Your browser doesn\'t support base64 conversions.');
            }
            svgString = atob(dataUri.data);
        }
        else
        {
            svgString = dataUri.data;
        }

        this._loadString(svgString);
    }

    /**
     * Loads an SVG string from `imageUrl` using XHR and then calls `_loadString`.
     *
     * @private
     */
    _loadXhr()
    {
        const svgXhr = new XMLHttpRequest();

        // This throws error on IE, so SVG Document can't be used
        // svgXhr.responseType = 'document';

        // This is not needed since we load the svg as string (breaks IE too)
        // but overrideMimeType() can be used to force the response to be parsed as XML
        // svgXhr.overrideMimeType('image/svg+xml');

        svgXhr.onload = () =>
        {
            if (svgXhr.readyState !== svgXhr.DONE || svgXhr.status !== 200)
            {
                throw new Error('Failed to load SVG using XHR.');
            }

            this._loadString(svgXhr.response);
        };

        // svgXhr.onerror = () => this.emit('error', this);

        svgXhr.open('GET', this.svg, true);
        svgXhr.send();
    }

    /**
     * Loads texture using an SVG string. The original SVG Image is stored as `origSource` and the
     * created canvas is the new `source`. The SVG is scaled using `sourceScale`. Called by
     * `_loadXhr` or `_loadDataUri`.
     *
     * @private
     * @param  {string} svgString SVG source as string
     *
     * @fires loaded
     */
    _loadString(svgString)
    {
        const svgSize = SVGResource.getSize(svgString);

        const tempImage = new Image();

        tempImage.src = `data:image/svg+xml,${svgString}`;

        tempImage.onerror = () =>
        {
            throw new Error(`Unable to load image from: ${tempImage.src}`);
        };

        tempImage.onload = () =>
        {
            const svgWidth = svgSize.width;
            const svgHeight = svgSize.height;

            if (!svgWidth || !svgHeight)
            {
                throw new Error('The SVG image must have width and height defined (in pixels), canvas API needs them.');
            }

            // Scale realWidth and realHeight
            this._width = Math.round(svgWidth * this.scale);
            this._height = Math.round(svgHeight * this.scale);

            // Create a canvas element
            const canvas = this.source;

            canvas.width = this._width;
            canvas.height = this._height;
            canvas._pixiId = `canvas_${uid()}`;

            // Draw the Svg to the canvas
            canvas
                .getContext('2d')
                .drawImage(tempImage, 0, 0, svgWidth, svgHeight, 0, 0, this.width, this.height);

            this._resolve();
            this._resolve = null;
        };
    }

    /**
     * Typedef for Size object.
     *
     * @memberof PIXI.resources.SVGResource
     * @typedef {object} Size
     * @property {number} width - Width component
     * @property {number} height - Height component
     */

    /**
     * Get size from an svg string using regexp.
     *
     * @method
     * @param {string} svgString - a serialized svg element
     * @return {PIXI.resources.SVGResource.Size} image extension
     */
    static getSize(svgString)
    {
        const sizeMatch = SVGResource.SVG_SIZE.exec(svgString);
        const size = {};

        if (sizeMatch)
        {
            size[sizeMatch[1]] = Math.round(parseFloat(sizeMatch[3]));
            size[sizeMatch[5]] = Math.round(parseFloat(sizeMatch[7]));
        }

        return size;
    }

    /**
     * Destroys this texture
     * @override
     */
    dispose()
    {
        super.dispose();
        this._resolve = null;
    }

    /**
     * Used to auto-detect the type of resource.
     *
     * @static
     * @param {*} source - The source object
     * @param {string} extension - The extension of source, if set
     */
    static test(source, extension)
    {
        // url file extension is SVG
        return extension === 'svg'
            // source is SVG data-uri
            || (typeof source === 'string' && source.indexOf('data:image/svg+xml') === 0);
    }
}

/**
 * RegExp for SVG size.
 *
 * @static
 * @constant {RegExp|string} SVG_SIZE
 * @memberof PIXI.resources.SVGResource
 * @example &lt;svg width="100" height="100"&gt;&lt;/svg&gt;
 */
SVGResource.SVG_SIZE = /<svg[^>]*(?:\s(width|height)=('|")(\d*(?:\.\d+)?)(?:px)?('|"))[^>]*(?:\s(width|height)=('|")(\d*(?:\.\d+)?)(?:px)?('|"))[^>]*>/i; // eslint-disable-line max-len
