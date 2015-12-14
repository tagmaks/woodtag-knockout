/// <binding />
'use strict';
var config = require('./gulp.config')(),
    args = require('yargs').argv,
    stylish = require('jshint-stylish'),
    del = require('del'),
    path = require('path'),
    gulp = require('gulp'),
    tsc = require('gulp-typescript'),
    $ = require('gulp-load-plugins')({ lazy: true }),
    _ = require('lodash');


/**
 * yargs variables can be passed in to alter the behavior, when present.
 * Example: gulp serve-dev
 *
 * --verbose  : Various tasks will produce more output to the console.
 */

/**
 * List the available gulp tasks
 */
gulp.task('help', $.taskListing);


/**
 * Watch TypeScript and recompile
 */
gulp.task('watchTs', function () {
    gulp.watch(config.clientts, ['compileTscToJs']);
});

/**
 * Compiles *.ts files
 */
gulp.task('compileTscToJs', function () {
    log('Compiling Typescript --> Javascript');

    var tscResults = gulp.src([config.clientts, config.typings])
        .pipe(tsc({
            target: "ES5",
            removeComments: true,
            noImplicitAny: true,
            noEmitOnError: true,
            noExternalResolve: true
        }));

    return tscResults.js
        .pipe(gulp.dest(config.temp));
});

/**
 * Watch LESS and recompile the CSS
 */
gulp.task('watcherLess', function () {
    gulp.watch([config.less], ['complileLessToCss']);
});

/**
 * Compiles less to css
 * @return {Stream}
 */
gulp.task('complileLessToCss', ['cleanStyles'], function () {
    log('Compiling Less --> Css');

    return gulp
        .src(config.less)
        //.pipe($.plumber()) // exit gracefully if something fails after this
        .pipe($.less())
        //.pipe($.autoprefixer({ browsers: ['last 2 version', '> 5%'] }))
        .pipe(gulp.dest(config.temp));
});

/**
 * Wire-up bower dependencies to index.html 
 * @return {Stream}
 */
gulp.task('injectBowerDepToIndex', function () {
    log('Injecting js bower dependencies --> index.html');

    var wiredep = require('wiredep').stream;
    var options = config.getWiredepDefaultOptions();

    return gulp
        .src(config.index)
        .pipe(wiredep(options)) //inject bower dependencies to index.html
        .pipe(gulp.dest(config.client));
});

/**
 * Copy bower dependencies to build
 * @return {Stream}
 */
gulp.task('copyBowerJsDepToBuild', function () {
    log('Coping js bower dependencies --> build');

    var filterJS = $.filter('**/*.js', { restore: true });

    return gulp
        .src(config.packages.bower)
        .pipe($.mainBowerFiles())
        .pipe(filterJS)
        .pipe($.uglify())
        .pipe(gulp.dest(config.build + 'js/libs'));
});

/**
 * Copy app dependencies to build
 * @return {Stream}
 */
gulp.task('copyAppJsDepToBuild', ['compileTscToJs'], function () {
    log('Coping app js dependencies --> build');

    return gulp
        .src(config.js)
        .pipe($.uglify())
        .pipe(gulp.dest(config.build + 'js'));
});

/**
 * Wire-up app css to index.html 
 * @return {Stream}
 */
gulp.task('injectAppCssToIndex', ['complileLessToCss'], function () {
    log('Wiring css up into the index.html, after files are ready');

    return gulp
        .src(config.index)
        .pipe(inject(config.css))
        .pipe(gulp.dest(config.client));
});


/**
 * Copy fonts
 * @return {Stream}
 */
gulp.task('fonts', ['cleanFonts'], function () {
    log('Copying fonts');

    return gulp
        .src(config.fonts)
        .pipe(gulp.dest(config.build + 'fonts'));
});

/**
 * Compress images
 * @return {Stream}
 */
gulp.task('images', ['cleanImages'], function () {
    log('Compressing and copying images');

    return gulp
        .src(config.images)
        //.pipe($.imagemin({ optimizationLevel: 4 }))
        .pipe(gulp.dest(config.build + 'images'));
});

/**
 * Remove all js and html from the build and temp folders
 * @param  {Function} done - callback when complete
 */
gulp.task('cleanCode', function (done) {
    var files = [].concat(
        config.temp + '**/*.js',
        config.build + 'js/**/*.js',
        config.build + '**/*.html'
    );
    clean(files, done);
});

/**
 * Remove all styles from the build and temp folders
 * @param  {Function} done - callback when complete
 */
gulp.task('cleanStyles', function (done) {
    var files = [].concat(
        config.temp + '**/*.css',
        config.build + 'styles/**/*.css'
    );
    return clean(files, done);
});

/**
 * Remove all fonts from the build folder
 * @param  {Function} done - callback when complete
 */
gulp.task('cleanFonts', function (done) {
    return clean(config.build + 'fonts/**/*.*', done);
});

/**
 * Remove all images from the build folder
 * @param  {Function} done - callback when complete
 */
gulp.task('cleanImages', function (done) {
    return clean(config.build + 'images/**/*.*', done);
});

/**
 * Optimize all files, move to a build folder,
 * and inject them into the new index.html
 * @return {Stream}
 */
gulp.task('optimize', ['injectBowerDepToIndex', 'injectAppCssToIndex', 'copyBowerJsDepToBuild', 'copyAppJsDepToBuild'], function () {
    log('Optimizing the js, css, and html');

    // Filters are named for the gulp-useref path
    var cssFilter = $.filter('**/*.css', { restore: true });
    var jsAppFilter = $.filter('**/' + config.optimized.app, { restore: true });

    return gulp
        .src(config.index)
        .pipe($.useref()) // Gather all assets from the html with useref
         //Get the css
        .pipe(cssFilter)
        .pipe($.csso())
        .pipe(cssFilter.restore)
        // Get the custom javascript
        .pipe(jsAppFilter)
        .pipe($.uglify())
        .pipe(jsAppFilter.restore)
        // Get the vendor javascript
        //// Take inventory of the file names for future rev numbers
        //.pipe($.rev())
        // Apply the concat and file replacement with useref
        //.pipe(assets.restore)
        .pipe($.useref())
        //// Replace the file names in the html with rev numbers
        //.pipe($.revReplace())
        .pipe(gulp.dest(config.build));
});

/**
 * Build everything
 * This is separate so we can run tests on
 * optimize before handling image or fonts
 */
gulp.task('build', ['images', 'fonts', 'optimize'], function () {
    log('Building everything');

    var msg = {
        title: 'gulp build',
        subtitle: 'Deployed to the build folder',
        message: 'Running `gulp serve-build`'
    };
    del(config.temp);
    log(msg);
    notify(msg);
});

/**
 * vet the code and create coverage report
 * @return {Stream}
 */
gulp.task('vet', function () {
    log('Analyzing source with JSHint and JSCS');

    return gulp
        .src(config.alljs)
        .pipe($.if(args.verbose, $.print()))
        .pipe($.jshint())
        .pipe($.jshint.reporter(stylish, { verbose: true }))
        .pipe($.jshint.reporter('fail'))
        .pipe($.jscs());
});

/**
 * Inject files in a sorted sequence at a specified inject label
 * @param   {Array} src   glob pattern for source files
 * @param   {String} label   The label name
 * @param   {Array} order   glob pattern for sort order of the files
 * @returns {Stream}   The stream
 */
function inject(src, label, order) {
    var options = {
        read: false,
        relative: true
    };
    if (label) {
        options.name = 'inject:' + label;
    }

    return $.inject(orderSrc(src, order), options);
}

/**
 * Order a stream
 * @param   {Stream} src   The gulp.src stream
 * @param   {Array} order Glob array pattern
 * @returns {Stream} The ordered stream
 */
function orderSrc(src, order) {
    //order = order || ['**/*'];
    return gulp
        .src(src)
        .pipe($.if(order, $.order(order)));
}

/**
 * Log a message or series of messages using chalk's blue color.
 * Can pass in a string, object or array.
 */
function log(msg) {
    if (typeof (msg) === 'object') {
        for (var item in msg) {
            if (msg.hasOwnProperty(item)) {
                $.util.log($.util.colors.blue(msg[item]));
            }
        }
    } else {
        $.util.log($.util.colors.blue(msg));
    }
}

/**
 * Delete all files in a given path
 * @param  {Array}   path - array of paths to delete
 * @param  {Function} done - callback when complete
 */
function clean(path, done) {
    log('Cleaning: ' + $.util.colors.blue(path));
    return del(path, done);
}

/**
 * Show OS level notification using node-notifier
 */
function notify(options) {
    var notifier = require('node-notifier');
    var notifyOptions = {
        sound: 'Bottle',
        contentImage: path.join(__dirname, 'gulp.png'),
        icon: path.join(__dirname, 'gulp.png')
    };
    _.assign(notifyOptions, options);
    notifier.notify(notifyOptions);
}