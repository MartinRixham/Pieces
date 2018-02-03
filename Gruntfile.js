module.exports = function(grunt) {

	grunt.loadNpmTasks("grunt-contrib-jshint");
	grunt.loadNpmTasks("grunt-jscs");
	grunt.loadNpmTasks('grunt-contrib-qunit');
	grunt.loadNpmTasks('grunt-contrib-requirejs');

	grunt.initConfig({

		pkg: grunt.file.readJSON("package.json"),
		jshint: {

			src: "src/main/webapp/js/*"
		},
		jscs: {

			src: "src/main/webapp/js/*",
			options: {

				config: ".jscsrc",
				fix: false
			}
		},
		qunit: {

			src: "src/test/webapp/index.html"
		},
		requirejs: {

			compile: {

				options: {

					baseUrl: "src/main/webapp",
					mainConfigFile: "src/main/webapp/main.js",
					name: "node_modules/almond/almond.js",
					include: ["main.js"],
					out: "src/main/webapp/main-production.js"
				}
			}
		}
	});

	grunt.registerTask("default", ["jshint", "jscs", "qunit", "requirejs"]);
};
