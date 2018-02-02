module.exports = function(grunt) {

	grunt.loadNpmTasks("grunt-contrib-jshint");
	grunt.loadNpmTasks("grunt-jscs");
	grunt.loadNpmTasks('grunt-contrib-qunit');

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

			src: "src/test/webapp/html/*",
			options: {

				timeout: 10000
			}
		}
	});

	grunt.registerTask("default", ["jshint", "jscs"]);
};
