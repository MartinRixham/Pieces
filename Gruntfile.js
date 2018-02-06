module.exports = function(grunt) {

	grunt.loadNpmTasks("grunt-contrib-jshint");
	grunt.loadNpmTasks("grunt-jscs");
	grunt.loadNpmTasks("grunt-contrib-qunit");
	grunt.loadNpmTasks("grunt-contrib-requirejs");
	grunt.loadNpmTasks("grunt-concat-define");

	grunt.initConfig({

		pkg: grunt.file.readJSON("package.json"),
		jshint: {

			src: "src/main/webapp/js/**/*.js"
		},
		jscs: {

			src: "src/main/webapp/js/**/*.js",
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
		},
		"concat-define": {

			options: {

				sourceRootDirectory: "src/main/webapp/js/pieces",
				outputFile: "target/pieces.js",
			}
		}
	});

	grunt.registerTask("default", ["jshint", "jscs", "qunit", "requirejs", "concat-define"]);
};
