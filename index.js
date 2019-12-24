/**
 * Module dependencies
 */

var nodemailer = require('nodemailer');
var htmlToText = require('nodemailer-html-to-text').htmlToText;
var ejs = require('ejs');
var fs = require('fs');
var path = require('path');
var async = require('async');
var _ = require('lodash');

/**
 * Email Hook
 *
 * Integration with relevant parts of the nodemailer API.
 *
 * For a full list of available email options see:
 * https://github.com/andris9/Nodemailer#e-mail-message-fields
 *
 * @param  {App} sails
 * @return {Object}
 * @hook
 */

module.exports = function Email(sails) {

  var transports = {};
  var self;

  var compileTemplate = function (view, data, cb) {
    // Use Sails View Hook if available
    if (sails.hooks.views && sails.hooks.views.render) {
      var relPath = path.relative(sails.config.paths.views, view);
      sails.hooks.views.render(relPath, data, cb);
      return;
    }

    // No Sails View hook, fallback to ejs
    fs.readFile(view + '.ejs', function (err, source) {
      if (err) return cb(err);

      try {
        var compileFn = ejs.compile((source || "").toString(), {
          cache: true, filename: view
        });

        cb(null, compileFn(data));
      } catch (e) {
        return cb(e);
      }
    });
  };

  return {

    /**
     * Default configuration
     * @type {Object}
     */
    defaults: {
      __configKey__: {
        service: 'Gmail',
        auth: {
          user: 'myemailaddress@gmail.com',
          pass: 'mypassword'
        },
        defaultTransporter: 'default',
        useDefaultTransportIfMissing: true,
        from: 'noreply@example.com',
        templateDir: path.resolve(sails.config.appPath, 'views/emailTemplates'),
        testMode: true
      }
    },

    configure: function () {
      // Ensure we have the full path, relative to app directory
      sails.config[this.configKey].templateDir = path.resolve(sails.config.appPath, sails.config[this.configKey].templateDir);
    },

    initialize: function (cb) {
      self = this;

      // If we don't have an array of transporters, create a single default transporter
      // using the configuration style of `sails-hook-email`.
      if (!Array.isArray(sails.config[self.configKey].transporters)) {
        sails.config[self.configKey].transporters = [
          {
            name: "default",
            service: sails.config[self.configKey].service,
            auth: sails.config[self.configKey].auth,
            transporter: sails.config[self.configKey].transporter,
            testMode: sails.config[self.configKey].testMode
          }
        ];
      }

      sails.config[self.configKey].transporters.forEach((transporterConfig) => {

        // Optimization for later on: precompile all the templates here and
        // build up a directory of named functions.
        //

        // Checking for `testMode === undefined` allows us to enable "global" `testMode`
        // while disabling it explicitly for a single transporter.
        if (transporterConfig.testMode || (transporterConfig.testMode === undefined && sails.config[self.configKey].testMode)) {
          transports[transporterConfig.name] = {
            sendMail: function (options, cb) {

              // Add sent timestamp
              options.sentAt = new Date();

              // First check the .tmp directory exists
              fs.exists(path.join(sails.config.appPath, '.tmp'), function (status) {
                if (!status) {
                  fs.mkdir(path.join(sails.config.appPath, '.tmp'), function (err) {
                    if (err) return cb(err);
                    fs.appendFile(path.join(sails.config.appPath, '.tmp/email-' + transporterConfig.name + '.txt'), JSON.stringify(options) + "\n", cb);
                  });
                  return;
                }

                // Otherwise just write to the .tmp/email.txt file
                fs.appendFile(path.join(sails.config.appPath, '.tmp/email-' + transporterConfig.name + '.txt'), JSON.stringify(options) + "\n", cb);
              });
            },
            extraopts: {
              from: transporterConfig.from
            }
          };
        } else {

          try {
            if (transporterConfig.transporter) {
              // If custom transporter is set, use that first
              transports[transporterConfig.name] = nodemailer.createTransport(transporterConfig.transporter);
            } else {
              // create reusable transport method (opens pool of SMTP connections)
              var smtpPool = require('nodemailer-smtp-pool');
              transports[transporterConfig.name] = nodemailer.createTransport(smtpPool({
                service: transporterConfig.service,
                auth: transporterConfig.auth
              }));
            }

            // Auto generate text
            transports[transporterConfig.name].use('compile', htmlToText());

            transports[transporterConfig.name].extraopts = {
              from: transporterConfig.from
            }
          }
          catch (e) {
            return cb(e);
          }
        }
      });
      return cb();
    },

    /**
     * Send an email.
     * @param  {Sting}    template (a named template to render)
     * @param  {Object}   data (data to pass into the template)
     * @param  {Object}   options (email options including to, from, etc)
     * @param  {Function} cb
     */

    send: function (template, data, options, cb) {

      data = data || {};
      // Turn off layouts by default
      if (typeof data.layout === 'undefined') data.layout = false;

      var templateDir = sails.config[self.configKey].templateDir;
      var templatePath = path.join(templateDir, template);

      var useTransporter = options.transporter || sails.config[self.configKey].defaultTransporter;

      var transport = transports[useTransporter];

      if (!transport && sails.config[self.configKey].useDefaultTransportIfMissing) {
        sails.log.warn(`Trying to use email transport "${useTransporter}", but it is not defined. Falling back to "default".`);
        transport = transports[sails.config[self.configKey].defaultTransporter];
      }

      if (!transport) {
        cb(new Error(`Email Transporter "${useTransporter}" not found. Check your "sails.config[${self.configKey}]" configuration.`));
        return;
      }

      // Set some default options
      var defaultOptions = {
        from: sails.config[self.configKey].from
      };

      // If there is an override in the transporter, use it.
      if ('string' === typeof transport.extraopts.from) {
        defaultOptions.from = transport.extraopts.from;
      }

      sails.log.verbose('EMAILING:', options);

      async.auto({

            // Grab the HTML version of the email template
            compileHtmlTemplate: function (next) {
              if (options.textOnly) {
                return next();
              }
              compileTemplate(templatePath + "/html", data, next);
            },

            // Grab the Text version of the email template
            compileTextTemplate: function (next) {
              compileTemplate(templatePath + "/text", data, function (err, html) {
                // If there is an error and we are not in `textOnly` mode,
                // we can generate plaintext from the HTML version of the template.
                if (err && !options.textOnly) return next();

                next(err, html);
              });
            },

            // Send the email
            sendEmail: ['compileHtmlTemplate', 'compileTextTemplate', function (results, next) {

              defaultOptions.html = results.compileHtmlTemplate;
              if (results.compileTextTemplate) defaultOptions.text = results.compileTextTemplate;

              // `options`, e.g.
              // {
              //   to: 'somebody@example.com',
              //   from: 'other@example.com',
              //   subject: 'Hello World'
              // }
              var mailOptions = _.defaults(options, defaultOptions);
              mailOptions.to = sails.config[self.configKey].alwaysSendTo || mailOptions.to;

              transport.sendMail(mailOptions, next);
            }]

          },

          // ASYNC callback
          function (err, results) {
            if (err) return cb(err);
            cb(null, results.sendEmail);
          });
    }

  };
};
